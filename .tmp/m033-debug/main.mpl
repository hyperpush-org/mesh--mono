from Storage.Schema import create_partitions_ahead

fn main() do
  println("before open")
  let pool_result = Pool.open("postgres://mesh:mesh@127.0.0.1:5432/mesher", 2, 10, 5000)
  case pool_result do
    Err(e) -> println("pool_err=#{e}")
    Ok(pool) -> do
      println("before create_partitions")
      let result = create_partitions_ahead(pool, 7)
      println("after create_partitions")
      case result do
        Ok(_) -> println("ok")
        Err(e) -> println("err=#{e}")
      end
    end
  end
end
