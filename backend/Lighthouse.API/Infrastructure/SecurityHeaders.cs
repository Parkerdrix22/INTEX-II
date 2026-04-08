namespace Lighthouse.API.Infrastructure;

public static class SecurityHeaders
{
    private const string ContentSecurityPolicyValue =
        "default-src 'self'; " +
        "base-uri 'self'; " +
        "frame-ancestors 'none'; " +
        "form-action 'self'; " +
        "object-src 'none'; " +
        "frame-src 'none'; " +
        "img-src 'self' data: https://kateri.byuisresearch.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com data:; " +
        "script-src 'self'; " +
        "connect-src 'self' http://localhost:5173 https://localhost:5173 ws://localhost:5173 wss://localhost:5173 http://localhost:7056 https://localhost:7056; " +
        "upgrade-insecure-requests";

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
