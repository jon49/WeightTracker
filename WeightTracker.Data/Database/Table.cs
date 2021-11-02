namespace WeightTracker.Data.Database
{
    public static class Table
    {
        public static class DataTable
        {
            public static string Table = nameof(Data);

            public static string Id = nameof(Data.Id);
            public static string _Id = $"${nameof(Data.Id)}";

            public static string Key = nameof(Data.Key);
            public static string _Key = $"${nameof(Data.Key)}";

            public static string UserId = nameof(Data.UserId);
            public static string _UserId = $"${nameof(Data.UserId)}";

            public static string Value = nameof(Data.Value);
            public static string _Value = $"${nameof(Data.Value)}";

            public static string Source = nameof(Data.Source);
            public static string _Source = $"${nameof(Data.Source)}";

        }
    }
}
