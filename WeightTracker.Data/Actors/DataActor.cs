using Proto;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WeightTracker.Data.Database;

# nullable enable

namespace WeightTracker.Data.Actors
{
    public record UploadedData
        ( string Key
        , byte[] Value
        , long Timestamp );
    public record SyncData
        ( long UserId
        , long LastId
        , string Source
        , IEnumerable<UploadedData>? UploadedData );

    public record SyncDataReturn
        ( List<NewUserData> NewUserData
        , long LastSyncedId );

    public class DataActor : IActor
    {
        private readonly DataDB _db;

        public DataActor(string dataDBPath)
        {
            _db = new(dataDBPath);
        }

        public Task ReceiveAsync(IContext context)
            => context.Message switch
            {
                SyncData x => SyncUserData(context, x),
                _ => Task.CompletedTask,
            };

        private async Task SyncUserData(IContext context, SyncData d)
        {
            var data = await _db!.GetNewDataCommand(userId: d.UserId, lastId: d.LastId);
            long lastSyncedId = 0;
            if (d.UploadedData is { })
            {
                lastSyncedId = _db!.SaveData(
                    d.UploadedData.Select(
                        x => new Database.Data
                            ( Id: x.Timestamp
                            , Key: x.Key
                            , UserId: d.UserId
                            , Value: x.Value
                            , Source: d.Source )));
                data = data.Where(x => !d.UploadedData.Any(y => y.Key == x.Key && y.Timestamp > x.Id)).ToList();
            }
            lastSyncedId =
                lastSyncedId > 0
                    ? lastSyncedId
                : data.Select(x => x.Id).Max();
            context.Respond(new SyncDataReturn(NewUserData: data, LastSyncedId: lastSyncedId));
        }

    }
}
