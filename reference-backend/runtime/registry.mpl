struct RegistryState do
  pool :: PoolHandle
end

service RuntimeRegistry do
  fn init(pool :: PoolHandle) -> RegistryState do
    RegistryState { pool: pool }
  end

  call GetPool() :: PoolHandle do |state|
    (state, state.pool)
  end
end

pub fn start_registry(pool :: PoolHandle) do
  let registry_pid = RuntimeRegistry.start(pool)
  let _ = Process.register("reference_backend_registry", registry_pid)
  registry_pid
end

pub fn get_pool() do
  let registry_pid = Process.whereis("reference_backend_registry")
  RuntimeRegistry.get_pool(registry_pid)
end
