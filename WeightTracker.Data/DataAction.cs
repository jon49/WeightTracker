using Proto;
using System.Diagnostics;
using System.Threading.Tasks;
using WeightTracker.Data.Actors;

namespace WeightTracker.Data
{
    public class DataAction
    {
        private readonly PID _pid;
        private readonly ActorSystem _system;

        public DataAction(ActorSystem system, string dataDBPath)
        {
            _system = system ?? throw new System.ArgumentNullException(nameof(system));
            var strategy = new OneForOneStrategy((pid, reason) =>
            {
                Debug.WriteLine(reason);
                return SupervisorDirective.Resume;
            }, 1, null);
            var props = Props.FromProducer(() => new DataActor(dataDBPath))
                .WithChildSupervisorStrategy(strategy);
            _pid = system.Root.Spawn(props);
        }

        public Task<SyncDataReturn> SyncData(SyncData syncData)
            => _system.Root.RequestAsync<SyncDataReturn>(_pid, syncData);
    }
}
