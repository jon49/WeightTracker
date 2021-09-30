using JFN.User;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using WeightTracker.Data;
using WeightTracker.Data.Actors;

#nullable enable

namespace WeightTracker.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class DataController : ControllerBase
    {
        private readonly User user;

        public DataController(User user)
        {
            this.user = user ?? throw new System.ArgumentNullException(nameof(user));
        }

        [HttpPost]
        public async Task<SyncDataReturnDto> Post([FromBody] SyncDataDto syncData, [FromServices] DataAction action)
        {
            var source = HttpContext.User.Claims.First(x => x.Type == "session").Value;
            var userId = (long?)HttpContext.Items["userId"];
            var result = await action.SyncData(new SyncData
                ( UserId: userId ?? throw new ArgumentException($"'{nameof(userId)}' was expected to have a value!")
                , LastId: syncData.LastId ?? 0
                , Source: source
                , UploadedData:
                    syncData.UploadedData
                    ?.Where(x => !string.IsNullOrEmpty(x.Key))
                    .Select(x => new UploadedData(x.Key, JsonSerializer.SerializeToUtf8Bytes(x.Value)))));
            return new(
                LastId: result.LastSyncedId,
                Data:
                    result.NewUserData
                    .Select(x => new DataReturnDto(Key: x.Key, Value: JsonSerializer.Deserialize<object>(x.Value))) );
        }
    }

    public class UploadedDataDto
    {
        public string Key { get; set; } = "";
        public object? Value { get; set; } = null;
    }

    public class SyncDataDto
    {
        [Required, Range(0, long.MaxValue, ErrorMessage = "Valid last ID required.")]
        public long? LastId { get; set; }
        public IEnumerable<UploadedDataDto>? UploadedData { get; set; }
    }

    public record DataReturnDto
        ( string Key
        , object? Value );
    public record SyncDataReturnDto
        ( IEnumerable<DataReturnDto> Data
        , long LastId );
}
