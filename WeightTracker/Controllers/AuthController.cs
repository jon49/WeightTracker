using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using WeightTracker.Models;

#nullable enable

namespace WeightTracker.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : BaseUserController
    {
        private readonly AdminSetting _settings;

        public AuthController(IOptions<AdminSetting> admin)
        {
            _settings = admin.Value;
        }

        [HttpGet]
        [Route("logged-in")]
        public bool IsLoggedIn()
            => UserId > 0;

        [HttpGet]
        [Route("info")]
        public Info? GetSession()
        {
            if (Request.Headers.TryGetValue("x-admin", out var secret) && secret.ToString() == _settings.Admin)
            {
                return new(Session: Session, UserId: UserId);
            }
            return null;
        }

    }

    public record Info
        ( string? Session
        , long? UserId );
}
