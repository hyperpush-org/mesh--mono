from Storage.Queries import list_issues_filtered

fn main() do
  let pool_result = Pool.open("postgres://mesh:mesh@127.0.0.1:50839/mesher", 1, 1, 5000)
  case pool_result do
    Err( e) -> println("pool_err=#{e}")
    Ok( pool) -> do
      let rows_result = list_issues_filtered(pool, "11111111-1111-1111-1111-111111111111", "unresolved", "", "", "", "", "25")
      case rows_result do
        Err( e) -> println("issue_err=#{e}")
        Ok( rows) -> println("issue_count=#{List.length(rows)}")
      end
    end
  end
end
