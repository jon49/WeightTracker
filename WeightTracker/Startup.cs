using JFN.User;
using JFN.UserAuthenticationWeb.Middleware;
using JFN.UserAuthenticationWeb.Settings;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Proto;
using System.Diagnostics;
using System.IO;
using static JFN.Utilities.Paths;

namespace WeightTracker
{
    public class Startup
    {
        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public IConfiguration Configuration { get; }

        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {
            services
                .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
                .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, options =>
                {
                    options.LoginPath = "/login";
                    options.LogoutPath = "/login?handler=logout";
                    options.Cookie.Name = "user_session";
                    options.SlidingExpiration = true;
                    options.Cookie.HttpOnly = true;
                    options.Cookie.SameSite = SameSiteMode.Strict;
                });
            services.AddRazorPages(options =>
            {
                options.Conventions.AuthorizeFolder("/app");
                options.Conventions.AuthorizeFolder("/api");
            });
            services.Configure<ForwardedHeadersOptions>(options =>
            {
                options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            });
            services.AddControllers();
            services.AddMemoryCache();

            services.Configure<UserSettings>(Configuration);
            services.AddSingleton<ActorSystem>();
            services.AddSingleton(x =>
                new User
                ( x.GetRequiredService<ActorSystem>(), new OneForOneStrategy((pid, reason) =>
                    {
                        Debug.WriteLine(reason);
                        return SupervisorDirective.Resume;
                    }, 1, null), Path.Combine(GetAppDir("weight-tracker"), "user.db")
                ));
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseForwardedHeaders();
                app.UseHsts();
            }

            app.UseStaticFiles();

            app.UseRouting();

            app.UseAuthentication();
            app.UseUserAuthenticationValidationMiddleware();
            app.UseAuthorization();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllers();
                endpoints.MapRazorPages();
            });
        }
    }
}
