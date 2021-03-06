using JFN.Utilities;
using Microsoft.Data.Sqlite;
using System.Collections.Generic;
using System.Linq;
using DB = JFN.Utilities.Database;
using D = WeightTracker.Data.Database.Table.DataTable;
using System.Threading.Tasks;
using System;

#nullable enable

namespace WeightTracker.Data.Database
{
    public record NewUserData
        ( long Id
        , string Key
        , byte[] Value );

    public class DataDB
    {
        private readonly SqliteConnection _readOnlyConnection;
        private readonly SqliteConnection _readWriteConnection;

        public DataDB(string dbPath)
        {
            var connectionString = $"Data Source={dbPath}";
            using var readWriteCreateConnection = new SqliteConnection($"{connectionString};Mode=ReadWriteCreate;");
            UpdateDatabase(readWriteCreateConnection);
            _readWriteConnection = new SqliteConnection($"{connectionString};Mode=ReadWrite;");
            _readWriteConnection.Open();

            _readOnlyConnection = new SqliteConnection($"{connectionString};Mode=ReadOnly;");
            _readOnlyConnection.Open();
        }

        private void UpdateDatabase(SqliteConnection readWriteCreateConnection)
        {
            readWriteCreateConnection.Open();
            DB.ExecuteCommand(readWriteCreateConnection, commandCreateDatabase);
            var lastMigration = (int)(DB.ExecuteCommand<long?>(readWriteCreateConnection, $@"SELECT LastMigration FROM Migration WHERE Id = 0;") ?? 0);
            if (lastMigration == migrations.Length)
            {
                return;
            }
            foreach(var migration in migrations.Skip(lastMigration))
            {
                if (migration is { })
                {
                    DB.ExecuteCommand(readWriteCreateConnection, migration);
                }
            }
            DB.ExecuteCommand(readWriteCreateConnection, $@"INSERT INTO Migration (Id, LastMigration) VALUES (0, {migrations.Length}) ON CONFLICT (Id) DO UPDATE SET LastMigration = {migrations.Length};");
            readWriteCreateConnection.Close();
        }

        private static readonly string _createDataCommand = $@"
INSERT INTO {D.Table} ({D.Id}, {D.Key}, {D.Source}, {D.UserId}, {D.Value})
VALUES ({D._Id}, {D._Key}, {D._Source}, {D._UserId}, {D._Value});";
        public long SaveData(IEnumerable<Data> data)
        {
            DB.BulkInsert(
                _readWriteConnection,
                _createDataCommand,
                data.Select(x => new DBParams[]
                {
                    new(Name: D._Id, x.Id),
                    new(Name: D._Key, x.Key),
                    new(Name: D._Source, x.Source),
                    new(Name: D._UserId, x.UserId),
                    new(Name: D._Value, x.Value),
                }));
            return DB.ExecuteCommand<long>(_readOnlyConnection, $"SELECT MAX({D.Id}) FROM {D.Table};");
        }

        private static readonly string _getDataCommand = $@"
WITH Duplicates AS (
	SELECT *, ROW_NUMBER() OVER (PARTITION BY {D.UserId}, {D.Key} ORDER BY {D.Id} DESC) DupNum
	FROM {D.Table}
    WHERE {D.Id} > {D._Id}
      AND {D.UserId} = {D._UserId}
)
SELECT d.{D.Key}, d.{D.Value}, d.{D.Id}
FROM Duplicates d
WHERE DupNum = 1;";
        public async Task<List<NewUserData>> GetNewDataCommand(long userId, long lastId)
        {
            var list = new List<NewUserData>();
            await DB.ExecuteCommandAsync(
                _readOnlyConnection,
                _getDataCommand,
                x => list.Add(new((long)x[D.Id], x[D.Key] as string ?? "", x[D.Value] as byte[] ?? Array.Empty<byte>())),
                new DBParams(Name: D._UserId, Value: userId),
                new DBParams(Name: D._Id, Value: lastId));
            return list;
        }

        private static readonly string commandCreateDataTable = $@"
CREATE TABLE IF NOT EXISTS {D.Table} (
    {D.Id} INTEGER NOT NULL,
    {D.UserId} INTEGER NOT NULL,
    {D.Key} TEXT NOT NULL,
    {D.Source} TEXT NOT NULL,
    {D.Value} BLOB NULL );
CREATE UNIQUE INDEX IF NOT EXISTS idx_fetch ON {D.Table} ({D.Id}, {D.UserId}, {D.Key});";

        private static readonly string commandCreateDatabase = $@"
{commandCreateDataTable}
CREATE TABLE IF NOT EXISTS Migration (Id INTEGER NOT NULL, LastMigration INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_id ON Migration (Id);";

        private static readonly string?[] migrations = new[]
        {
            null,
            $@"
BEGIN TRANSACTION;
ALTER TABLE {D.Table} RENAME TO {D.Table}_temp;
{commandCreateDataTable}
INSERT INTO {D.Table} ({D.Id}, {D.UserId}, {D.Key}, {D.Source}, {D.Value})
SELECT CASE WHEN Timestamp = 0 THEN {D.Id} ELSE Timestamp END, {D.UserId}, {D.Key}, {D.Source}, {D.Value}
FROM {D.Table}_temp;
DROP TABLE {D.Table}_temp;
CREATE UNIQUE INDEX idx_fetch ON {D.Table} ({D.Id}, {D.UserId}, {D.Key});
COMMIT;",
        };

    }
}
