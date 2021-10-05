using Microsoft.AspNetCore.Mvc;
using System;
using System.Linq;

namespace WeightTracker.Controllers
{
    public class BaseUserController : ControllerBase
    {
        public long UserId => (long?)HttpContext.Items["userId"] ?? throw new UserControllerException("userId not found.");
        public string Session => HttpContext.User.Claims.First(x => x.Type == "session").Value;
    }

    public class UserControllerException : Exception
    {
        public UserControllerException(string message) : base(message) { }
    }
}
