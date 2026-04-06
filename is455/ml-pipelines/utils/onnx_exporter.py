"""
Shared ONNX export and verification utilities.
Converts fitted sklearn Pipelines to ONNX and verifies round-trip correctness.
"""

import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd


def export_to_onnx(
    pipeline,
    X_train: pd.DataFrame,
    output_path: str | Path,
    schema_meta: dict,
    target_opset: int = 17,
) -> None:
    """
    Export a fitted sklearn Pipeline to ONNX and write a companion _schema.json.

    Args:
        pipeline: Fitted sklearn Pipeline (must contain only skl2onnx-supported steps).
        X_train: Training features as a DataFrame (used to infer input shape).
        output_path: Path to write the .onnx file (e.g., "models/pipeline_01.onnx").
        schema_meta: Dict with keys: model_name, feature_order, output_tensors.
                     Written to <output_path.stem>_schema.json.
        target_opset: ONNX opset version (17 is broadly compatible with OnnxRuntime 1.16+).
    """
    try:
        from skl2onnx import convert_sklearn
        from skl2onnx.common.data_types import FloatTensorType, StringTensorType
    except ImportError:
        raise ImportError("Install skl2onnx: pip install skl2onnx>=1.17.0")

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Build per-column initial types so skl2onnx can match ColumnTransformer column names
    if hasattr(X_train, "columns"):
        initial_type = []
        for col in X_train.columns:
            if X_train[col].dtype == object or str(X_train[col].dtype) == "string":
                initial_type.append((col, StringTensorType([None, 1])))
            else:
                initial_type.append((col, FloatTensorType([None, 1])))
    else:
        n_features = X_train.shape[1]
        initial_type = [("float_input", FloatTensorType([None, n_features]))]

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        onnx_model = convert_sklearn(
            pipeline, initial_types=initial_type, target_opset=target_opset
        )

    with open(output_path, "wb") as f:
        f.write(onnx_model.SerializeToString())

    # Write companion schema JSON
    n_features = X_train.shape[1]
    schema = {
        "model_name": schema_meta.get("model_name", output_path.stem),
        "version": schema_meta.get("version", "1.0"),
        "input_tensor_name": "float_input",
        "n_features": n_features,
        "feature_order": list(X_train.columns),
        "output_tensors": schema_meta.get("output_tensors", []),
    }
    schema_path = output_path.parent / (output_path.stem + "_schema.json")
    with open(schema_path, "w") as f:
        json.dump(schema, f, indent=2)

    print(f"  Exported: {output_path}")
    print(f"  Schema:   {schema_path}")


def verify_onnx(
    onnx_path: str | Path,
    sklearn_pipeline,
    X_test: pd.DataFrame,
    atol: float = 1e-4,
    is_classifier: bool = False,
) -> bool:
    """
    Round-trip verification: compare sklearn predictions to ONNX predictions.
    Returns True if they match within atol, False otherwise.
    """
    try:
        import onnxruntime as rt
    except ImportError:
        raise ImportError("Install onnxruntime: pip install onnxruntime>=1.18.0")

    if is_classifier:
        sklearn_preds = sklearn_pipeline.predict_proba(X_test)
    else:
        sklearn_preds = sklearn_pipeline.predict(X_test)

    sess = rt.InferenceSession(str(onnx_path))
    inputs = sess.get_inputs()

    # Build ONNX input dict — handle per-column named inputs or single tensor
    if len(inputs) > 1 and hasattr(X_test, "columns"):
        onnx_input = {}
        for inp in inputs:
            col = inp.name
            if col in X_test.columns:
                if inp.type.startswith("tensor(string"):
                    onnx_input[col] = X_test[col].fillna("").astype(str).values.reshape(-1, 1)
                else:
                    onnx_input[col] = X_test[col].values.astype(np.float32).reshape(-1, 1)
            else:
                onnx_input[col] = np.zeros((len(X_test), 1), dtype=np.float32)
    else:
        input_name = inputs[0].name
        X_np = X_test.values.astype(np.float32) if hasattr(X_test, "values") else X_test.astype(np.float32)
        onnx_input = {input_name: X_np}

    output_names = [o.name for o in sess.get_outputs()]
    onnx_outputs = sess.run(output_names, onnx_input)

    if is_classifier:
        # Compare probabilities (second output for classifiers)
        prob_idx = next(
            (i for i, o in enumerate(sess.get_outputs()) if "prob" in o.name.lower()),
            1,
        )
        onnx_preds = onnx_outputs[prob_idx]
        # OnnxRuntime returns list of dicts for classifier probabilities sometimes
        if isinstance(onnx_preds, list):
            onnx_preds = np.array(
                [[d[k] for k in sorted(d.keys())] for d in onnx_preds]
            )
    else:
        onnx_preds = onnx_outputs[0].ravel()
        sklearn_preds = np.array(sklearn_preds).ravel()

    match = np.allclose(sklearn_preds, onnx_preds, atol=atol)
    if match:
        print(f"  Verification PASSED: sklearn and ONNX predictions match (atol={atol})")
    else:
        max_diff = np.abs(np.array(sklearn_preds) - np.array(onnx_preds)).max()
        print(f"  Verification FAILED: max diff = {max_diff:.6f} (atol={atol})")
    return match
