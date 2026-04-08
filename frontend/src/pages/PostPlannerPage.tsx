import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import './PostPlannerPage.css';

type PlannerOptions = {
  platforms: string[];
  postTypes: string[];
  mediaTypes: string[];
  contentTopics: string[];
  sentimentTones: string[];
  daysOfWeek: string[];
};

type ModelInfo = {
  postCount: number;
  r2: number;
  trainedAt: string | null;
  modelName: string;
};

type PredictionResult = {
  engagementRate: number;
  rating: string;
  percentile: number;
};

type AttributionGroup = {
  category: string;
  postCount: number;
  donationCount: number;
  revenue: number;
  avgDonation: number;
  avgEngagementRate: number;
  revenuePerPost: number;
};

type TopPost = {
  postId: number;
  postType: string;
  contentTopic: string;
  platform: string;
  sentimentTone: string;
  engagementRate: number;
  donationCount: number;
  revenue: number;
  createdAt: string | null;
};

type ScatterPoint = {
  postId: number;
  postType: string;
  engagementRate: number;
  revenue: number;
};

type AttributionData = {
  totalDonations: number;
  attributedDonations: number;
  attributedRevenue: number;
  attributionCoveragePct: number;
  byPostType: AttributionGroup[];
  byContentTopic: AttributionGroup[];
  byPlatform: AttributionGroup[];
  topPosts: TopPost[];
  engagementVsRevenue: ScatterPoint[];
};

type FormState = {
  platform: string;
  postType: string;
  mediaType: string;
  contentTopic: string;
  sentimentTone: string;
  dayOfWeek: string;
  captionLength: number;
  numHashtags: number;
  mentionsCount: number;
  postHour: number;
  followerCount: number;
  isBoosted: boolean;
  hasCallToAction: boolean;
  featuresResidentStory: boolean;
  hasCampaign: boolean;
};

const LABEL_MAP: Record<string, string> = {
  ImpactStory: 'Impact Story',
  EducationalContent: 'Educational Content',
  EventPromotion: 'Event Promotion',
  FundraisingAppeal: 'Fundraising Appeal',
  ThankYou: 'Thank You',
  AwarenessRaising: 'Awareness Raising',
  CampaignLaunch: 'Campaign Launch',
  DonorImpact: 'Donor Impact',
  EventRecap: 'Event Recap',
  SafehouseLife: 'Safehouse Life',
};

const humanize = (s: string) => LABEL_MAP[s] ?? s;

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  const ampm = i >= 12 ? 'PM' : 'AM';
  const h = i === 0 ? 12 : i > 12 ? i - 12 : i;
  return `${h}:00 ${ampm}`;
});

const ratingColor = (rating: string) => {
  switch (rating) {
    case 'Excellent': return '#5f8448';
    case 'Strong': return '#6a9a50';
    case 'Average': return '#c9983f';
    case 'Below Average': return '#c07a3a';
    default: return '#a63d40';
  }
};

export function PostPlannerPage() {
  const [options, setOptions] = useState<PlannerOptions | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [animateResult, setAnimateResult] = useState(false);
  const [attribution, setAttribution] = useState<AttributionData | null>(null);
  const [attrTab, setAttrTab] = useState<'postType' | 'contentTopic' | 'platform'>('postType');

  const [form, setForm] = useState<FormState>({
    platform: 'Instagram',
    postType: 'ImpactStory',
    mediaType: 'Photo',
    contentTopic: 'DonorImpact',
    sentimentTone: 'Hopeful',
    dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
    captionLength: 150,
    numHashtags: 5,
    mentionsCount: 1,
    postHour: 10,
    followerCount: 5000,
    isBoosted: false,
    hasCallToAction: true,
    featuresResidentStory: false,
    hasCampaign: false,
  });

  useEffect(() => {
    fetch('/api/social-media-planner/options', { credentials: 'include' })
      .then(r => r.json())
      .then(setOptions)
      .catch(console.error);
    fetch('/api/social-media-planner/model-info', { credentials: 'include' })
      .then(r => r.json())
      .then(setModelInfo)
      .catch(console.error);
    fetch('/api/social-media-planner/attribution', { credentials: 'include' })
      .then(r => r.json())
      .then(setAttribution)
      .catch(console.error);
  }, []);

  const predict = async () => {
    setLoading(true);
    setAnimateResult(false);
    try {
      const res = await fetch('/api/social-media-planner/predict', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setPrediction(data);
      setTimeout(() => setAnimateResult(true), 50);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const activeRollup = useMemo(() => {
    if (!attribution) return [];
    if (attrTab === 'postType') return attribution.byPostType;
    if (attrTab === 'contentTopic') return attribution.byContentTopic;
    return attribution.byPlatform;
  }, [attribution, attrTab]);

  const moneyShort = useMemo(
    () => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
    [],
  );
  const moneyDetailed = useMemo(
    () => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
    [],
  );

  if (!options) {
    return (
      <div className="planner-loading">
        <div className="planner-loading-spinner" />
        <p>Loading Post Planner...</p>
      </div>
    );
  }

  return (
    <div className="planner-page">
      <div className="planner-header">
        <span className="planner-overline">ML-Powered Insights</span>
        <h1 className="planner-title">Post Planner</h1>
        <p className="planner-subtitle">
          Plan your next social media post and get an AI-predicted engagement rate
          before you publish. Powered by a {modelInfo?.modelName ?? 'Gradient Boosting'} model trained on{' '}
          <strong>{modelInfo?.postCount?.toLocaleString() ?? '...'}</strong> historical posts.
          {modelInfo?.trainedAt && (
            <span className="planner-trained-at">
              {' '}Last trained {new Date(modelInfo.trainedAt).toLocaleDateString()}.
            </span>
          )}
        </p>
      </div>

      <div className="planner-grid">
        {/* Left: Form */}
        <div className="planner-form-panel">
          <div className="form-section">
            <h3 className="form-section-label">Post Details</h3>
            <div className="form-row-2col">
              <SelectField
                label="Platform"
                value={form.platform}
                options={options.platforms}
                onChange={v => updateField('platform', v)}
              />
              <SelectField
                label="Post Type"
                value={form.postType}
                options={options.postTypes}
                onChange={v => updateField('postType', v)}
                format={humanize}
              />
            </div>
            <div className="form-row-2col">
              <SelectField
                label="Media Type"
                value={form.mediaType}
                options={options.mediaTypes}
                onChange={v => updateField('mediaType', v)}
              />
              <SelectField
                label="Content Topic"
                value={form.contentTopic}
                options={options.contentTopics}
                onChange={v => updateField('contentTopic', v)}
                format={humanize}
              />
            </div>
            <div className="form-row-2col">
              <SelectField
                label="Sentiment Tone"
                value={form.sentimentTone}
                options={options.sentimentTones}
                onChange={v => updateField('sentimentTone', v)}
              />
              <SelectField
                label="Day of Week"
                value={form.dayOfWeek}
                options={options.daysOfWeek}
                onChange={v => updateField('dayOfWeek', v)}
              />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-label">Content Metrics</h3>
            <div className="form-row-2col">
              <SliderField
                label="Caption Length"
                value={form.captionLength}
                min={10}
                max={500}
                unit="chars"
                onChange={v => updateField('captionLength', v)}
              />
              <SliderField
                label="Hashtags"
                value={form.numHashtags}
                min={0}
                max={30}
                onChange={v => updateField('numHashtags', v)}
              />
            </div>
            <div className="form-row-2col">
              <SliderField
                label="Mentions"
                value={form.mentionsCount}
                min={0}
                max={10}
                onChange={v => updateField('mentionsCount', v)}
              />
              <div className="field-group">
                <label className="field-label">Post Time</label>
                <select
                  className="field-select"
                  value={form.postHour}
                  onChange={e => updateField('postHour', +e.target.value)}
                >
                  {HOUR_LABELS.map((label, i) => (
                    <option key={i} value={i}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <SliderField
              label="Current Followers"
              value={form.followerCount}
              min={100}
              max={100000}
              step={100}
              unit="followers"
              onChange={v => updateField('followerCount', v)}
            />
          </div>

          <div className="form-section">
            <h3 className="form-section-label">Post Options</h3>
            <div className="toggle-grid">
              <ToggleField
                label="Boosted Post"
                sublabel="Paid promotion"
                value={form.isBoosted}
                onChange={v => updateField('isBoosted', v)}
              />
              <ToggleField
                label="Call to Action"
                sublabel="Donate, Share, etc."
                value={form.hasCallToAction}
                onChange={v => updateField('hasCallToAction', v)}
              />
              <ToggleField
                label="Resident Story"
                sublabel="Features a resident"
                value={form.featuresResidentStory}
                onChange={v => updateField('featuresResidentStory', v)}
              />
              <ToggleField
                label="Campaign Link"
                sublabel="Tied to a campaign"
                value={form.hasCampaign}
                onChange={v => updateField('hasCampaign', v)}
              />
            </div>
          </div>

          <button className="predict-btn" onClick={predict} disabled={loading}>
            {loading ? (
              <span className="predict-btn-loading">Analyzing...</span>
            ) : (
              <>Predict Engagement</>
            )}
          </button>
        </div>

        {/* Right: Result */}
        <div className="planner-result-panel">
          {!prediction && !loading && (
            <div className="result-empty">
              <div className="result-empty-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
              <p className="result-empty-text">Configure your post details and click <strong>Predict Engagement</strong> to see the model's forecast.</p>
            </div>
          )}

          {loading && (
            <div className="result-loading">
              <div className="result-loading-pulse" />
              <p>Running ML inference...</p>
            </div>
          )}

          {prediction && !loading && (
            <div className={`result-card ${animateResult ? 'result-card--visible' : ''}`}>
              <div className="result-gauge-area">
                <div className="result-gauge-ring" style={{ '--ring-color': ratingColor(prediction.rating) } as React.CSSProperties}>
                  <div className="result-gauge-inner">
                    <span className="result-gauge-number">{prediction.engagementRate.toFixed(1)}</span>
                    <span className="result-gauge-unit">%</span>
                  </div>
                </div>
                <div className="result-gauge-label">Predicted Engagement Rate</div>
              </div>

              <div className="result-meta">
                <div className="result-badge" style={{ backgroundColor: ratingColor(prediction.rating) }}>
                  {prediction.rating}
                </div>
                <div className="result-percentile">
                  Top <strong>{100 - prediction.percentile}%</strong> of posts
                </div>
              </div>

              <div className="result-explainer">
                <h4 className="result-explainer-title">What does this mean?</h4>
                <p className="result-explainer-text">
                  <strong>Engagement rate</strong> is the percentage of people who see your post and interact with it (like, comment, share, or click).
                  {prediction.engagementRate >= 8
                    ? ` A rate of ${prediction.engagementRate.toFixed(1)}% is exceptional — for every 1,000 people who see this post, roughly ${Math.round(prediction.engagementRate * 10)} will engage. Most social media posts average 1–3%.`
                    : prediction.engagementRate >= 5
                    ? ` A rate of ${prediction.engagementRate.toFixed(1)}% is above average — for every 1,000 people who see this post, roughly ${Math.round(prediction.engagementRate * 10)} will engage. This outperforms most nonprofit social media content.`
                    : prediction.engagementRate >= 3
                    ? ` A rate of ${prediction.engagementRate.toFixed(1)}% is typical — for every 1,000 people who see this post, roughly ${Math.round(prediction.engagementRate * 10)} will engage. Consider the tips below to improve performance.`
                    : ` A rate of ${prediction.engagementRate.toFixed(1)}% is below average — for every 1,000 people who see this post, only about ${Math.round(prediction.engagementRate * 10)} will engage. Try adjusting the content or platform using the tips below.`
                  }
                </p>
              </div>

              <div className="result-bar-track">
                <div
                  className="result-bar-fill"
                  style={{
                    width: `${Math.min(prediction.engagementRate / 12 * 100, 100)}%`,
                    backgroundColor: ratingColor(prediction.rating),
                  }}
                />
                <div className="result-bar-labels">
                  <span>0%</span>
                  <span>3%</span>
                  <span>6%</span>
                  <span>9%</span>
                  <span>12%+</span>
                </div>
              </div>

              <div className="result-scale-legend">
                <div className="result-scale-item">
                  <span className="result-scale-dot" style={{ background: '#a63d40' }} />
                  <span>&lt; 1.5% Low</span>
                </div>
                <div className="result-scale-item">
                  <span className="result-scale-dot" style={{ background: '#c07a3a' }} />
                  <span>1.5–3% Below Avg</span>
                </div>
                <div className="result-scale-item">
                  <span className="result-scale-dot" style={{ background: '#c9983f' }} />
                  <span>3–5% Average</span>
                </div>
                <div className="result-scale-item">
                  <span className="result-scale-dot" style={{ background: '#6a9a50' }} />
                  <span>5–8% Strong</span>
                </div>
                <div className="result-scale-item">
                  <span className="result-scale-dot" style={{ background: '#5f8448' }} />
                  <span>&gt; 8% Excellent</span>
                </div>
              </div>

              <div className="result-tips">
                <h4 className="result-tips-title">How to Improve</h4>
                {!form.hasCallToAction && (
                  <p className="result-tip">Adding a <strong>call to action</strong> (e.g., "Donate now," "Share this story") typically boosts engagement by 15–25%.</p>
                )}
                {!form.featuresResidentStory && (
                  <p className="result-tip">Posts featuring <strong>resident stories</strong> consistently outperform generic awareness content — they create an emotional connection with donors.</p>
                )}
                {form.numHashtags > 15 && (
                  <p className="result-tip">Fewer hashtags (5–10) often <strong>outperform</strong> hashtag-heavy posts. Too many can look spammy and reduce reach.</p>
                )}
                {form.numHashtags === 0 && (
                  <p className="result-tip">Adding <strong>3–8 relevant hashtags</strong> helps new audiences discover your content.</p>
                )}
                {(form.postHour < 8 || form.postHour > 20) && (
                  <p className="result-tip">Posts between <strong>9 AM and 6 PM</strong> tend to reach more of your audience when they're actively scrolling.</p>
                )}
                {form.isBoosted && (
                  <p className="result-tip">Boosting increases <strong>reach</strong> (more impressions) but doesn't proportionally increase engagement rate. The content itself matters more than the ad spend.</p>
                )}
                {form.hasCallToAction && form.featuresResidentStory && form.numHashtags <= 15 && form.numHashtags > 0 && form.postHour >= 8 && form.postHour <= 20 && (
                  <p className="result-tip result-tip--good">This post is well-optimized. You have the right combination of content, timing, and engagement signals.</p>
                )}
              </div>
            </div>
          )}

          <div className="result-disclaimer">
            Predictions generated by a {modelInfo?.modelName ?? 'Gradient Boosting'} model
            (R&sup2; = {modelInfo?.r2 ?? '...'}) trained on {modelInfo?.postCount?.toLocaleString() ?? '...'} posts.
            Actual engagement may vary.
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* Donation Attribution — closes the loop on Pipeline 3            */}
      {/* ============================================================== */}
      {attribution && (
        <section className="attribution-section">
          <header className="attribution-header">
            <h2 className="attribution-title">Do likes turn into dollars?</h2>
            <p className="attribution-subtitle">
              {attribution.attributedDonations} of {attribution.totalDonations} donations
              ({attribution.attributionCoveragePct}%) trace back to a specific social media
              post via <code>donations.referral_post_id</code>. That gives us a direct view of
              which content is actually driving revenue — not just engagement.
            </p>
          </header>

          {/* Headline KPIs */}
          <div className="attribution-kpis">
            <div className="attribution-kpi">
              <span className="attribution-kpi-label">Attributed Revenue</span>
              <span className="attribution-kpi-value">{moneyDetailed.format(attribution.attributedRevenue)}</span>
              <span className="attribution-kpi-meta">across {attribution.attributedDonations} donations</span>
            </div>
            <div className="attribution-kpi">
              <span className="attribution-kpi-label">Attribution Coverage</span>
              <span className="attribution-kpi-value">{attribution.attributionCoveragePct}%</span>
              <span className="attribution-kpi-meta">of all donations linked to a post</span>
            </div>
            <div className="attribution-kpi">
              <span className="attribution-kpi-label">Top Earning Type</span>
              <span className="attribution-kpi-value">
                {attribution.byPostType[0] ? humanize(attribution.byPostType[0].category) : '—'}
              </span>
              <span className="attribution-kpi-meta">
                {attribution.byPostType[0]
                  ? `${moneyShort.format(attribution.byPostType[0].revenue)} total revenue`
                  : ''}
              </span>
            </div>
            <div className="attribution-kpi">
              <span className="attribution-kpi-label">Best ROI Per Post</span>
              <span className="attribution-kpi-value">
                {attribution.byPostType.length > 0
                  ? humanize([...attribution.byPostType].sort((a, b) => b.revenuePerPost - a.revenuePerPost)[0].category)
                  : '—'}
              </span>
              <span className="attribution-kpi-meta">
                {attribution.byPostType.length > 0
                  ? `${moneyShort.format([...attribution.byPostType].sort((a, b) => b.revenuePerPost - a.revenuePerPost)[0].revenuePerPost)} avg per post`
                  : ''}
              </span>
            </div>
          </div>

          {/* Tabs + bar chart */}
          <article className="attribution-card">
            <header className="attribution-card-head">
              <div>
                <h3>Revenue breakdown</h3>
                <p>How much each category actually brought in</p>
              </div>
              <div className="attribution-tabs" role="tablist">
                <button
                  type="button"
                  className={`attribution-tab${attrTab === 'postType' ? ' is-active' : ''}`}
                  onClick={() => setAttrTab('postType')}
                  role="tab"
                  aria-selected={attrTab === 'postType'}
                >
                  Post Type
                </button>
                <button
                  type="button"
                  className={`attribution-tab${attrTab === 'contentTopic' ? ' is-active' : ''}`}
                  onClick={() => setAttrTab('contentTopic')}
                  role="tab"
                  aria-selected={attrTab === 'contentTopic'}
                >
                  Content Topic
                </button>
                <button
                  type="button"
                  className={`attribution-tab${attrTab === 'platform' ? ' is-active' : ''}`}
                  onClick={() => setAttrTab('platform')}
                  role="tab"
                  aria-selected={attrTab === 'platform'}
                >
                  Platform
                </button>
              </div>
            </header>
            <div className="attribution-chart-wrap">
              <ResponsiveContainer width="100%" height={Math.max(260, activeRollup.length * 38)}>
                <BarChart data={activeRollup} layout="vertical" margin={{ left: 16, right: 36 }}>
                  <CartesianGrid stroke="rgba(170,190,208,0.25)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="rgba(31,47,63,0.55)"
                    fontSize={11}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    stroke="rgba(31,47,63,0.75)"
                    fontSize={12}
                    width={140}
                    tickFormatter={(v: string) => humanize(v)}
                  />
                  <Tooltip
                    formatter={((value: unknown, _name: unknown, item: { payload?: AttributionGroup }) => {
                      const row = item?.payload;
                      const num = typeof value === 'number' ? value : Number(value ?? 0);
                      return [
                        `${moneyDetailed.format(num)} from ${row?.donationCount ?? 0} donations`,
                        row ? humanize(row.category) : '',
                      ];
                    }) as never}
                    contentStyle={{
                      background: 'rgba(255,253,247,0.96)',
                      border: '1px solid rgba(170,190,208,0.4)',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                    {activeRollup.map((_, i) => (
                      <Cell
                        key={i}
                        fill={i === 0 ? '#385f82' : i === 1 ? '#5f8a9f' : '#8aa3b5'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="attribution-card-footnote">
              Bars are total attributed dollars. Hover for donation count. The chart updates by category.
            </p>
          </article>

          {/* Two-column row: scatter + top posts table */}
          <div className="attribution-row">
            {/* Scatter: engagement vs revenue */}
            <article className="attribution-card">
              <header className="attribution-card-head">
                <div>
                  <h3>Engagement vs revenue</h3>
                  <p>Each dot is a post that drove at least one donation</p>
                </div>
              </header>
              <div className="attribution-chart-wrap">
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ left: 8, right: 28, top: 12, bottom: 8 }}>
                    <CartesianGrid stroke="rgba(170,190,208,0.25)" />
                    <XAxis
                      type="number"
                      dataKey="engagementRate"
                      name="Engagement"
                      stroke="rgba(31,47,63,0.55)"
                      fontSize={11}
                      tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                    />
                    <YAxis
                      type="number"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="rgba(31,47,63,0.55)"
                      fontSize={11}
                      tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                    />
                    <ZAxis range={[60, 120]} />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      formatter={((value: unknown, name: unknown) => {
                        const num = typeof value === 'number' ? value : Number(value ?? 0);
                        if (name === 'Engagement') return [`${(num * 100).toFixed(2)}%`, 'Engagement'];
                        if (name === 'Revenue') return [moneyDetailed.format(num), 'Revenue'];
                        return [String(value), String(name)];
                      }) as never}
                      contentStyle={{
                        background: 'rgba(255,253,247,0.96)',
                        border: '1px solid rgba(170,190,208,0.4)',
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Scatter
                      data={attribution.engagementVsRevenue}
                      fill="#385f82"
                      fillOpacity={0.65}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="attribution-card-footnote">
                {attribution.engagementVsRevenue.length} posts shown. If high-engagement posts also
                drove the highest revenue, points would cluster diagonally — they don't.
              </p>
            </article>

            {/* Top 10 posts table */}
            <article className="attribution-card">
              <header className="attribution-card-head">
                <div>
                  <h3>Top 10 revenue-driving posts</h3>
                  <p>The actual content that paid the bills</p>
                </div>
              </header>
              <div className="attribution-table-wrap">
                <table className="attribution-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Type</th>
                      <th>Topic</th>
                      <th>Platform</th>
                      <th className="text-right">Eng</th>
                      <th className="text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attribution.topPosts.map((p, idx) => (
                      <tr key={p.postId}>
                        <td>{idx + 1}</td>
                        <td>{humanize(p.postType)}</td>
                        <td>{humanize(p.contentTopic)}</td>
                        <td>{p.platform}</td>
                        <td className="text-right">{(p.engagementRate * 100).toFixed(1)}%</td>
                        <td className="text-right attribution-revenue-cell">
                          {moneyShort.format(p.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </section>
      )}
    </div>
  );
}

/* ---- Reusable sub-components ---- */

function SelectField({ label, value, options, onChange, format }: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  format?: (s: string) => string;
}) {
  return (
    <div className="field-group">
      <label className="field-label">{label}</label>
      <select className="field-select" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => (
          <option key={o} value={o}>{format ? format(o) : o}</option>
        ))}
      </select>
    </div>
  );
}

function SliderField({ label, value, min, max, step, unit, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field-group">
      <label className="field-label">
        {label}
        <span className="field-value">{value.toLocaleString()}{unit ? ` ${unit}` : ''}</span>
      </label>
      <input
        type="range"
        className="field-slider"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={e => onChange(+e.target.value)}
      />
    </div>
  );
}

function ToggleField({ label, sublabel, value, onChange }: {
  label: string;
  sublabel: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`toggle-card ${value ? 'toggle-card--active' : ''}`}>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-card-label">{label}</span>
      <span className="toggle-card-sub">{sublabel}</span>
    </label>
  );
}
