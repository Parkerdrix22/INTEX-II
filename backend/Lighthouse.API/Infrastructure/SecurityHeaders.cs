namespace Lighthouse.API.Infrastructure;

public static class SecurityHeaders
{
    public static IApplicationBuilder UseLighthouseSecurityHeaders(this IApplicationBuilder app)
    {
        return app.Use(
            async (context, next) =>
            {
                context.Response.Headers["Content-Security-Policy"] =
                    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'";
                await next();
            });
    }
}
