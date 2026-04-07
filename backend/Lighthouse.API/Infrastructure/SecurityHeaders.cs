namespace Lighthouse.API.Infrastructure;

public static class SecurityHeaders
{
    private const string ContentSecurityPolicyValue =
        "default-src 'self'; " +
        "base-uri 'self'; " +
        "frame-ancestors 'none'; " +
        "object-src 'none'; " +
        "img-src 'self' data: https:; " +
        "style-src 'self' 'unsafe-inline'; " +
        "script-src 'self'; " +
        "connect-src 'self' https: http://localhost:5173 https://localhost:7056";

    public static IApplicationBuilder UseLighthouseSecurityHeaders(this IApplicationBuilder app)
    {
        return app.Use(
            async (context, next) =>
            {
                context.Response.Headers["Content-Security-Policy"] = ContentSecurityPolicyValue;
                await next();
            });
    }
}
