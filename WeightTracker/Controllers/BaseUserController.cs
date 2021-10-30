using Microsoft.AspNetCore.Mvc;
using System;
using System.Linq;

#nullable enable

namespace WeightTracker.Controllers
{
    public class BaseUserController : ControllerBase
    {
        public long UserId => (long?)HttpContext.Items["userId"] ?? 0;
        public string? Session => HttpContext.User.Claims.FirstOrDefault(x => x.Type == "session")?.Value;
    }

    public class UserControllerException : Exception
    {
        public UserControllerException(string message) : base(message) { }
    }
}
