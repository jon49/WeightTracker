using Microsoft.AspNetCore.Mvc;

namespace WeightTracker.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController  : BaseUserController
    {
        [HttpGet]
        [Route("logged-in")]
        public bool IsLoggedIn()
            => UserId > 0;
    }
}
