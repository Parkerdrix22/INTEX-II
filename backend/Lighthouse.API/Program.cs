using Lighthouse.API.Data;
using Lighthouse.API.Data.Entities;
using Lighthouse.API.Infrastructure;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

LocalEnvLoader.Apply(builder.Configuration, builder.Environment.ContentRootPath);

// Behind Azure App Service Linux's reverse proxy, the app sees incoming
// requests as http://localhost. Without ForwardedHeaders, ASP.NET Core
// generates http:// callback URLs for OAuth (Google rejects them as a
// redirect_uri_mismatch). This restores the original scheme and host.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<Lighthouse.API.Services.IStaffNotificationEmailService, Lighthouse.API.Services.StaffNotificationEmailService>();

var frontendUrl = builder.Configuration["FrontendUrl"] ?? "http://localhost:5173";
builder.Services.AddCors(options =>
{
    options.AddPolicy(
        "Frontend",
        policy =>
            policy.WithOrigins(frontendUrl)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials());
});

var googleClientId = builder.Configuration["Authentication:Google:ClientId"];
var googleClientSecret = builder.Configuration["Authentication:Google:ClientSecret"];

var authBuilder = builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, options =>
    {
        options.Cookie.Name = "lighthouse.auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        // Always require HTTPS in production; allow HTTP cookies in dev so local
        // auth works against http://localhost without HTTPS.
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        options.SlidingExpiration = true;
        options.ExpireTimeSpan = TimeSpan.FromDays(7);
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    })
    .AddCookie(IdentityConstants.ExternalScheme, options =>
    {
        options.Cookie.Name = "lighthouse.external";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        options.ExpireTimeSpan = TimeSpan.FromMinutes(5);
    });

if (!string.IsNullOrWhiteSpace(googleClientId) && !string.IsNullOrWhiteSpace(googleClientSecret))
{
    authBuilder.AddGoogle(options =>
    {
        options.ClientId = googleClientId;
        options.ClientSecret = googleClientSecret;
        options.SignInScheme = IdentityConstants.ExternalScheme;
        options.CallbackPath = "/signin-google";
    });
}

builder.Services
    .AddIdentityCore<AppUser>(options =>
    {
        options.Password.RequiredLength = 14;
        options.Password.RequireUppercase = true;
        options.Password.RequireNonAlphanumeric = true;
        options.Password.RequireDigit = false;
        options.Password.RequireLowercase = false;
        options.Password.RequiredUniqueChars = 1;
        options.User.RequireUniqueEmail = true;
    })
    .AddRoles<IdentityRole<int>>()
    .AddEntityFrameworkStores<AppDbContext>()
    .AddSignInManager()
    // Required for TOTP authenticator + recovery codes (VerifyTwoFactorTokenAsync, etc.)
    .AddDefaultTokenProviders();

builder.Services.AddAuthorizationBuilder()
    .AddPolicy("AdminOnly", policy => policy.RequireRole(UserRoles.Admin))
    .AddPolicy("AdminOrStaff", policy => policy.RequireRole(UserRoles.Admin, UserRoles.Staff));

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? builder.Configuration["DATABASE_URL"]
    ?? throw new InvalidOperationException("Missing database connection string.");

builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddScoped<IPasswordHasher<Lighthouse.API.Data.Entities.AppUser>, PasswordHasher<Lighthouse.API.Data.Entities.AppUser>>();
builder.Services.AddScoped<Lighthouse.API.Services.IWebsiteChatService, Lighthouse.API.Services.AnthropicWebsiteChatService>();
builder.Services.AddScoped<Lighthouse.API.Services.INeedBasedAllocationService, Lighthouse.API.Services.NeedBasedAllocationService>();
builder.Services.AddScoped<Lighthouse.API.Services.IDonationValuationService, Lighthouse.API.Services.DonationValuationService>();

var app = builder.Build();

await AuthSeeder.SeedAsync(app.Services);

// Honor X-Forwarded-Proto / X-Forwarded-For from Azure's reverse proxy
// MUST be registered BEFORE UseAuthentication so OAuth callback URLs are
// generated as https://, not http://. Otherwise Google rejects them.
app.UseForwardedHeaders();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
else
{
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseCors("Frontend");
app.UseLighthouseSecurityHeaders();
app.UseAuthentication();
app.UseAuthorization();

// Serve the React frontend from wwwroot (populated during CI/CD build)
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapControllers();

// SPA fallback — any non-API, non-file request serves index.html for client-side routing
app.MapFallbackToFile("index.html");

app.MapGet(
        "/api/ping",
        () => Results.Ok(new { message = "Lighthouse API is running", utc = DateTime.UtcNow }))
    .WithName("Ping");

app.Run();
