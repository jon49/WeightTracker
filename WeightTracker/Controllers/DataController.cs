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
    public class DataController : BaseUserController
    {
        [HttpPost]
        public async Task<SyncDataReturnDto> Post([FromBody] SyncDataDto syncData, [FromServices] DataAction action)
        {
            var result = await action.SyncData(new SyncData
                ( UserId: UserId
                , LastId: syncData.LastId ?? 0
                , Source: Session
                , UploadedData:
                    from xs in syncData.Data
                    where xs.Length == 2 && !string.IsNullOrEmpty(xs[0].ToString())
                    select new UploadedData(xs[0].ToString() ?? "", JsonSerializer.SerializeToUtf8Bytes(xs[1])) ));
            return new(
                LastId: result.LastSyncedId,
                Data:
                    from x in result.NewUserData
                    select new[] { x.Key, JsonSerializer.Deserialize<object>(x.Value) } );
        }

        [HttpGet]
        public bool Get()
            => UserId > 0;
    }

    public class SyncDataDto
    {
        [Required, Range(0, long.MaxValue, ErrorMessage = "Valid last ID required.")]
        public long? LastId { get; set; } = 0;
        public object[][]? Data { get; set; }
    }

    public record SyncDataReturnDto
        ( IEnumerable<object[]> Data
        , long LastId );
}
