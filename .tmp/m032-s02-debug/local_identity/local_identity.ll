; ModuleID = 'mesh_module'
source_filename = "mesh_module"
target datalayout = "e-m:o-p270:32:32-p271:32:32-p272:64:64-i64:64-i128:128-n32:64-S128-Fn32"
target triple = "arm64-apple-darwin25.3.0"

@.str = unnamed_addr constant [4 x i8] c"poly"
@fn_reg_identity = private unnamed_addr constant [9 x i8] c"identity\00", align 1
@fn_reg_mesh_main = private unnamed_addr constant [10 x i8] c"mesh_main\00", align 1

declare void @mesh_rt_init()

declare ptr @mesh_gc_alloc_actor(i64, i64)

declare ptr @mesh_string_new(ptr, i64)

declare ptr @mesh_string_concat(ptr, ptr)

declare ptr @mesh_int_to_string(i64)

declare ptr @mesh_float_to_string(double)

declare ptr @mesh_bool_to_string(i8)

declare void @mesh_print(ptr)

declare void @mesh_println(ptr)

declare void @mesh_rt_init_actor(i32)

declare i64 @mesh_actor_spawn(ptr, ptr, i64, i8)

declare void @mesh_actor_send(i64, ptr, i64)

declare ptr @mesh_actor_receive(i64)

declare i64 @mesh_actor_self()

declare void @mesh_actor_link(i64)

declare void @mesh_reduction_check()

declare void @mesh_actor_set_terminate(i64, ptr)

declare void @mesh_rt_run_scheduler()

declare i64 @mesh_supervisor_start(ptr, i64)

declare i64 @mesh_supervisor_start_child(i64, ptr, i64)

declare i64 @mesh_supervisor_terminate_child(i64, i64)

declare i64 @mesh_supervisor_count_children(i64)

declare void @mesh_actor_trap_exit()

declare void @mesh_actor_exit(i64, i8)

declare i64 @mesh_string_length(ptr)

declare ptr @mesh_string_slice(ptr, i64, i64)

declare i8 @mesh_string_contains(ptr, ptr)

declare i8 @mesh_string_starts_with(ptr, ptr)

declare i8 @mesh_string_ends_with(ptr, ptr)

declare ptr @mesh_string_trim(ptr)

declare ptr @mesh_string_to_upper(ptr)

declare ptr @mesh_string_to_lower(ptr)

declare ptr @mesh_string_replace(ptr, ptr, ptr)

declare i8 @mesh_string_eq(ptr, ptr)

declare ptr @mesh_string_split(ptr, ptr)

declare ptr @mesh_string_join(ptr, ptr)

declare ptr @mesh_string_to_int(ptr)

declare ptr @mesh_string_to_float(ptr)

declare ptr @mesh_file_read(ptr)

declare ptr @mesh_file_write(ptr, ptr)

declare ptr @mesh_file_append(ptr, ptr)

declare i8 @mesh_file_exists(ptr)

declare ptr @mesh_file_delete(ptr)

declare ptr @mesh_io_read_line()

declare void @mesh_io_eprintln(ptr)

declare ptr @mesh_env_get(ptr)

declare ptr @mesh_env_args()

declare ptr @mesh_env_get_with_default(ptr, ptr)

declare i64 @mesh_env_get_int(ptr, i64)

declare ptr @mesh_regex_from_literal(ptr, i64)

declare ptr @mesh_regex_compile(ptr)

declare i8 @mesh_regex_match(ptr, ptr)

declare ptr @mesh_regex_captures(ptr, ptr)

declare ptr @mesh_regex_replace(ptr, ptr, ptr)

declare ptr @mesh_regex_split(ptr, ptr)

declare ptr @mesh_crypto_sha256(ptr)

declare ptr @mesh_crypto_sha512(ptr)

declare ptr @mesh_crypto_hmac_sha256(ptr, ptr)

declare ptr @mesh_crypto_hmac_sha512(ptr, ptr)

declare i8 @mesh_crypto_secure_compare(ptr, ptr)

declare ptr @mesh_crypto_uuid4()

declare ptr @mesh_base64_encode(ptr)

declare ptr @mesh_base64_decode(ptr)

declare ptr @mesh_base64_encode_url(ptr)

declare ptr @mesh_base64_decode_url(ptr)

declare ptr @mesh_hex_encode(ptr)

declare ptr @mesh_hex_decode(ptr)

declare i64 @mesh_datetime_utc_now()

declare ptr @mesh_datetime_from_iso8601(ptr)

declare ptr @mesh_datetime_to_iso8601(i64)

declare ptr @mesh_datetime_from_unix_ms(i64)

declare i64 @mesh_datetime_to_unix_ms(i64)

declare ptr @mesh_datetime_from_unix_secs(i64)

declare i64 @mesh_datetime_to_unix_secs(i64)

declare i64 @mesh_datetime_add(i64, i64, ptr)

declare double @mesh_datetime_diff(i64, i64, ptr)

declare i8 @mesh_datetime_before(i64, i64)

declare i8 @mesh_datetime_after(i64, i64)

declare i64 @mesh_http_build(ptr, ptr)

declare i64 @mesh_http_header(i64, ptr, ptr)

declare i64 @mesh_http_body(i64, ptr)

declare i64 @mesh_http_timeout(i64, i64)

declare i64 @mesh_http_query(i64, ptr, ptr)

declare i64 @mesh_http_json(i64, ptr)

declare ptr @mesh_http_send(i64)

declare i64 @mesh_http_stream(i64, ptr, ptr)

declare i64 @mesh_http_stream_bytes(i64, ptr, ptr)

declare void @mesh_http_cancel(i64)

declare i64 @mesh_http_client()

declare ptr @mesh_http_send_with(i64, i64)

declare void @mesh_http_client_close(i64)

declare void @mesh_test_begin(ptr)

declare void @mesh_test_pass()

declare void @mesh_test_fail_msg(ptr)

declare void @mesh_test_assert(i8, ptr, ptr, i64, i64)

declare void @mesh_test_assert_eq(ptr, ptr, ptr, ptr, i64, i64)

declare void @mesh_test_assert_ne(ptr, ptr, ptr, ptr, i64, i64)

declare void @mesh_test_assert_raises(ptr, ptr, ptr, i64, i64)

declare void @mesh_test_summary(i64, i64, i64)

declare void @mesh_test_cleanup_actors()

declare void @mesh_test_run_body(ptr, ptr)

declare i64 @mesh_test_mock_actor(ptr, ptr)

declare i64 @mesh_test_pass_count()

declare i64 @mesh_test_fail_count()

declare ptr @mesh_list_new()

declare i64 @mesh_list_length(ptr)

declare ptr @mesh_list_append(ptr, i64)

declare i64 @mesh_list_head(ptr)

declare ptr @mesh_list_tail(ptr)

declare i64 @mesh_list_get(ptr, i64)

declare ptr @mesh_list_concat(ptr, ptr)

declare ptr @mesh_list_reverse(ptr)

declare ptr @mesh_list_map(ptr, ptr, ptr)

declare ptr @mesh_list_filter(ptr, ptr, ptr)

declare i64 @mesh_list_reduce(ptr, i64, ptr, ptr)

declare ptr @mesh_list_from_array(ptr, i64)

declare ptr @mesh_list_builder_new(i64)

declare void @mesh_list_builder_push(ptr, i64)

declare ptr @mesh_list_sort(ptr, ptr, ptr)

declare ptr @mesh_list_find(ptr, ptr, ptr)

declare i8 @mesh_list_any(ptr, ptr, ptr)

declare i8 @mesh_list_all(ptr, ptr, ptr)

declare i8 @mesh_list_contains(ptr, i64)

declare i8 @mesh_list_contains_str(ptr, ptr)

declare ptr @mesh_list_zip(ptr, ptr)

declare ptr @mesh_list_flat_map(ptr, ptr, ptr)

declare ptr @mesh_list_flatten(ptr)

declare ptr @mesh_list_enumerate(ptr)

declare ptr @mesh_list_take(ptr, i64)

declare ptr @mesh_list_drop(ptr, i64)

declare i64 @mesh_list_last(ptr)

declare i64 @mesh_list_nth(ptr, i64)

declare ptr @mesh_map_new()

declare ptr @mesh_map_new_typed(i64)

declare ptr @mesh_map_tag_string(ptr)

declare ptr @mesh_map_put(ptr, i64, i64)

declare i64 @mesh_map_get(ptr, i64)

declare i8 @mesh_map_has_key(ptr, i64)

declare ptr @mesh_map_delete(ptr, i64)

declare i64 @mesh_map_size(ptr)

declare ptr @mesh_map_keys(ptr)

declare ptr @mesh_map_values(ptr)

declare ptr @mesh_map_merge(ptr, ptr)

declare ptr @mesh_map_to_list(ptr)

declare ptr @mesh_map_from_list(ptr)

declare i64 @mesh_map_entry_key(ptr, i64)

declare i64 @mesh_map_entry_value(ptr, i64)

declare ptr @mesh_set_new()

declare ptr @mesh_set_add(ptr, i64)

declare ptr @mesh_set_remove(ptr, i64)

declare i8 @mesh_set_contains(ptr, i64)

declare i64 @mesh_set_size(ptr)

declare ptr @mesh_set_union(ptr, ptr)

declare ptr @mesh_set_intersection(ptr, ptr)

declare i64 @mesh_set_element_at(ptr, i64)

declare ptr @mesh_set_difference(ptr, ptr)

declare ptr @mesh_set_to_list(ptr)

declare ptr @mesh_set_from_list(ptr)

declare i64 @mesh_tuple_nth(ptr, i64)

declare i64 @mesh_tuple_first(ptr)

declare i64 @mesh_tuple_second(ptr)

declare i64 @mesh_tuple_size(ptr)

declare ptr @mesh_range_new(i64, i64)

declare ptr @mesh_range_to_list(ptr)

declare ptr @mesh_range_map(ptr, ptr, ptr)

declare ptr @mesh_range_filter(ptr, ptr, ptr)

declare i64 @mesh_range_length(ptr)

declare ptr @mesh_queue_new()

declare ptr @mesh_queue_push(ptr, i64)

declare ptr @mesh_queue_pop(ptr)

declare i64 @mesh_queue_peek(ptr)

declare i64 @mesh_queue_size(ptr)

declare i8 @mesh_queue_is_empty(ptr)

declare ptr @mesh_json_parse(ptr)

declare ptr @mesh_json_parse_raw(ptr)

declare ptr @mesh_json_encode(ptr)

declare ptr @mesh_json_encode_string(ptr)

declare ptr @mesh_json_encode_int(i64)

declare ptr @mesh_json_encode_bool(i8)

declare ptr @mesh_json_encode_map(ptr)

declare ptr @mesh_json_encode_list(ptr)

declare ptr @mesh_json_from_int(i64)

declare ptr @mesh_json_from_float(double)

declare ptr @mesh_json_from_bool(i8)

declare ptr @mesh_json_from_string(ptr)

declare ptr @mesh_json_get(ptr, ptr)

declare ptr @mesh_json_get_nested(ptr, ptr, ptr)

declare ptr @mesh_json_object_new()

declare ptr @mesh_json_object_put(ptr, ptr, ptr)

declare ptr @mesh_json_object_get(ptr, ptr)

declare ptr @mesh_json_array_new()

declare ptr @mesh_json_array_push(ptr, ptr)

declare ptr @mesh_json_array_get(ptr, i64)

declare ptr @mesh_json_as_int(ptr)

declare ptr @mesh_json_as_float(ptr)

declare ptr @mesh_json_as_string(ptr)

declare ptr @mesh_json_as_bool(ptr)

declare ptr @mesh_json_null()

declare ptr @mesh_json_from_list(ptr, ptr)

declare ptr @mesh_json_from_map(ptr, ptr)

declare ptr @mesh_json_to_list(ptr, ptr)

declare ptr @mesh_json_to_map(ptr, ptr)

declare ptr @mesh_alloc_result(i64, ptr)

declare i64 @mesh_result_is_ok(ptr)

declare ptr @mesh_result_unwrap(ptr)

declare ptr @mesh_http_router()

declare ptr @mesh_http_route(ptr, ptr, ptr)

declare void @mesh_http_serve(ptr, i64)

declare void @mesh_http_serve_tls(ptr, i64, ptr, ptr)

declare void @mesh_ws_serve(ptr, ptr, ptr, ptr, ptr, ptr, i64)

declare i64 @mesh_ws_send(ptr, ptr)

declare i64 @mesh_ws_send_binary(ptr, ptr, i64)

declare void @mesh_ws_serve_tls(ptr, ptr, ptr, ptr, ptr, ptr, i64, ptr, ptr)

declare i64 @mesh_ws_join(ptr, ptr)

declare i64 @mesh_ws_leave(ptr, ptr)

declare i64 @mesh_ws_broadcast(ptr, ptr)

declare i64 @mesh_ws_broadcast_except(ptr, ptr, ptr)

declare ptr @mesh_http_response_new(i64, ptr)

declare ptr @mesh_http_response_with_headers(i64, ptr, ptr)

declare ptr @mesh_http_get(ptr)

declare ptr @mesh_http_post(ptr, ptr)

declare ptr @mesh_http_request_method(ptr)

declare ptr @mesh_http_request_path(ptr)

declare ptr @mesh_http_request_body(ptr)

declare ptr @mesh_http_request_header(ptr, ptr)

declare ptr @mesh_http_request_query(ptr, ptr)

declare ptr @mesh_http_route_get(ptr, ptr, ptr)

declare ptr @mesh_http_route_post(ptr, ptr, ptr)

declare ptr @mesh_http_route_put(ptr, ptr, ptr)

declare ptr @mesh_http_route_delete(ptr, ptr, ptr)

declare ptr @mesh_http_request_param(ptr, ptr)

declare ptr @mesh_http_use_middleware(ptr, ptr)

declare ptr @mesh_sqlite_open(ptr)

declare void @mesh_sqlite_close(i64)

declare ptr @mesh_sqlite_execute(i64, ptr, ptr)

declare ptr @mesh_sqlite_query(i64, ptr, ptr)

declare ptr @mesh_pg_connect(ptr)

declare void @mesh_pg_close(i64)

declare ptr @mesh_pg_execute(i64, ptr, ptr)

declare ptr @mesh_pg_query(i64, ptr, ptr)

declare ptr @mesh_pg_begin(i64)

declare ptr @mesh_pg_commit(i64)

declare ptr @mesh_pg_rollback(i64)

declare ptr @mesh_pg_transaction(i64, ptr, ptr)

declare ptr @mesh_sqlite_begin(i64)

declare ptr @mesh_sqlite_commit(i64)

declare ptr @mesh_sqlite_rollback(i64)

declare ptr @mesh_pool_open(ptr, i64, i64, i64)

declare void @mesh_pool_close(i64)

declare ptr @mesh_pool_checkout(i64)

declare void @mesh_pool_checkin(i64, i64)

declare ptr @mesh_pool_query(i64, ptr, ptr)

declare ptr @mesh_pool_execute(i64, ptr, ptr)

declare ptr @mesh_row_from_row_get(ptr, ptr)

declare ptr @mesh_row_parse_int(ptr)

declare ptr @mesh_row_parse_float(ptr)

declare ptr @mesh_row_parse_bool(ptr)

declare ptr @mesh_pg_query_as(i64, ptr, ptr, ptr)

declare ptr @mesh_pool_query_as(i64, ptr, ptr, ptr)

declare i64 @mesh_hash_int(i64)

declare i64 @mesh_hash_float(double)

declare i64 @mesh_hash_bool(i8)

declare i64 @mesh_hash_string(ptr)

declare i64 @mesh_hash_combine(i64, i64)

declare ptr @mesh_list_to_string(ptr, ptr)

declare ptr @mesh_map_to_string(ptr, ptr, ptr)

declare ptr @mesh_set_to_string(ptr, ptr)

declare ptr @mesh_string_to_string(i64)

declare i8 @mesh_list_eq(ptr, ptr, ptr)

declare i64 @mesh_list_compare(ptr, ptr, ptr)

declare ptr @mesh_service_call(i64, i64, ptr, i64)

declare void @mesh_service_reply(i64, ptr, i64)

declare i64 @mesh_job_async(ptr, ptr)

declare ptr @mesh_job_await(i64)

declare ptr @mesh_job_await_timeout(i64, i64)

declare ptr @mesh_job_map(ptr, ptr, ptr)

declare void @mesh_timer_sleep(i64)

declare void @mesh_timer_send_after(i64, i64, ptr, i64)

; Function Attrs: noreturn
declare void @mesh_panic(ptr, i64, ptr, i64, i32) #0

declare i64 @mesh_node_start(ptr, i64, ptr, i64)

declare i64 @mesh_node_connect(ptr, i64)

declare ptr @mesh_node_self()

declare ptr @mesh_node_list()

declare i64 @mesh_node_monitor(ptr, i64)

declare i64 @mesh_node_spawn(ptr, i64, ptr, i64, ptr, i64, i8)

declare void @mesh_register_function(ptr, i64, ptr)

declare i64 @mesh_process_monitor(i64)

declare i64 @mesh_process_demonitor(i64)

declare i64 @mesh_process_register(ptr, i64)

declare i64 @mesh_process_whereis(ptr)

declare void @mesh_actor_send_named(ptr, i64, ptr, i64, ptr, i64)

declare ptr @mesh_list_iter_new(ptr)

declare ptr @mesh_list_iter_next(ptr)

declare ptr @mesh_map_iter_new(ptr)

declare ptr @mesh_map_iter_next(ptr)

declare ptr @mesh_set_iter_new(ptr)

declare ptr @mesh_set_iter_next(ptr)

declare ptr @mesh_range_iter_new(i64, i64)

declare ptr @mesh_range_iter_next(ptr)

declare ptr @mesh_iter_from(ptr)

declare ptr @mesh_iter_map(ptr, ptr, ptr)

declare ptr @mesh_iter_filter(ptr, ptr, ptr)

declare ptr @mesh_iter_take(ptr, i64)

declare ptr @mesh_iter_skip(ptr, i64)

declare ptr @mesh_iter_enumerate(ptr)

declare ptr @mesh_iter_zip(ptr, ptr)

declare i64 @mesh_iter_count(ptr)

declare i64 @mesh_iter_sum(ptr)

declare i8 @mesh_iter_any(ptr, ptr, ptr)

declare i8 @mesh_iter_all(ptr, ptr, ptr)

declare ptr @mesh_iter_find(ptr, ptr, ptr)

declare i64 @mesh_iter_reduce(ptr, i64, ptr, ptr)

declare ptr @mesh_iter_generic_next(ptr)

declare ptr @mesh_iter_map_next(ptr)

declare ptr @mesh_iter_filter_next(ptr)

declare ptr @mesh_iter_take_next(ptr)

declare ptr @mesh_iter_skip_next(ptr)

declare ptr @mesh_iter_enumerate_next(ptr)

declare ptr @mesh_iter_zip_next(ptr)

declare ptr @mesh_list_collect(ptr)

declare ptr @mesh_map_collect(ptr)

declare ptr @mesh_map_collect_string_keys(ptr)

declare ptr @mesh_set_collect(ptr)

declare ptr @mesh_string_collect(ptr)

declare ptr @mesh_orm_build_select(ptr, ptr, ptr, ptr, i64, i64)

declare ptr @mesh_orm_build_insert(ptr, ptr, ptr)

declare ptr @mesh_orm_build_update(ptr, ptr, ptr, ptr)

declare ptr @mesh_orm_build_delete(ptr, ptr, ptr)

declare ptr @mesh_query_from(ptr)

declare ptr @mesh_query_where(ptr, ptr, ptr)

declare ptr @mesh_query_where_op(ptr, ptr, ptr, ptr)

declare ptr @mesh_query_where_in(ptr, ptr, ptr)

declare ptr @mesh_query_where_null(ptr, ptr)

declare ptr @mesh_query_where_not_null(ptr, ptr)

declare ptr @mesh_query_where_not_in(ptr, ptr, ptr)

declare ptr @mesh_query_where_between(ptr, ptr, ptr, ptr)

declare ptr @mesh_query_where_or(ptr, ptr, ptr)

declare ptr @mesh_query_select(ptr, ptr)

declare ptr @mesh_query_order_by(ptr, ptr, ptr)

declare ptr @mesh_query_limit(ptr, i64)

declare ptr @mesh_query_offset(ptr, i64)

declare ptr @mesh_query_join(ptr, ptr, ptr, ptr)

declare ptr @mesh_query_join_as(ptr, ptr, ptr, ptr, ptr)

declare ptr @mesh_query_group_by(ptr, ptr)

declare ptr @mesh_query_having(ptr, ptr, ptr)

declare ptr @mesh_query_select_count(ptr)

declare ptr @mesh_query_select_count_field(ptr, ptr)

declare ptr @mesh_query_select_sum(ptr, ptr)

declare ptr @mesh_query_select_avg(ptr, ptr)

declare ptr @mesh_query_select_min(ptr, ptr)

declare ptr @mesh_query_select_max(ptr, ptr)

declare ptr @mesh_query_fragment(ptr, ptr, ptr)

declare ptr @mesh_query_select_raw(ptr, ptr)

declare ptr @mesh_query_where_raw(ptr, ptr, ptr)

declare ptr @mesh_query_order_by_raw(ptr, ptr)

declare ptr @mesh_query_group_by_raw(ptr, ptr)

declare ptr @mesh_query_where_sub(ptr, ptr, ptr)

declare ptr @mesh_repo_all(i64, ptr)

declare ptr @mesh_repo_one(i64, ptr)

declare ptr @mesh_repo_get(i64, ptr, ptr)

declare ptr @mesh_repo_get_by(i64, ptr, ptr, ptr)

declare ptr @mesh_repo_count(i64, ptr)

declare ptr @mesh_repo_exists(i64, ptr)

declare ptr @mesh_repo_insert(i64, ptr, ptr)

declare ptr @mesh_repo_update(i64, ptr, ptr, ptr)

declare ptr @mesh_repo_delete(i64, ptr, ptr)

declare ptr @mesh_repo_transaction(i64, ptr, ptr)

declare ptr @mesh_repo_update_where(i64, ptr, ptr, ptr)

declare ptr @mesh_repo_delete_where(i64, ptr, ptr)

declare ptr @mesh_repo_query_raw(i64, ptr, ptr)

declare ptr @mesh_repo_execute_raw(i64, ptr, ptr)

declare ptr @mesh_repo_insert_or_update(i64, ptr, ptr, ptr, ptr)

declare ptr @mesh_repo_delete_where_returning(i64, ptr, ptr)

declare ptr @mesh_repo_preload(i64, ptr, ptr, ptr)

declare ptr @mesh_repo_insert_changeset(i64, ptr, ptr)

declare ptr @mesh_repo_update_changeset(i64, ptr, ptr, ptr)

declare ptr @mesh_changeset_cast(ptr, ptr, ptr)

declare ptr @mesh_changeset_cast_with_types(ptr, ptr, ptr, ptr)

declare ptr @mesh_changeset_validate_required(ptr, ptr)

declare ptr @mesh_changeset_validate_length(ptr, ptr, ptr, ptr)

declare ptr @mesh_changeset_validate_format(ptr, ptr, ptr)

declare ptr @mesh_changeset_validate_inclusion(ptr, ptr, ptr)

declare ptr @mesh_changeset_validate_number(ptr, ptr, ptr, ptr, ptr, ptr)

declare ptr @mesh_changeset_valid(ptr)

declare ptr @mesh_changeset_errors(ptr)

declare ptr @mesh_changeset_changes(ptr)

declare ptr @mesh_changeset_get_change(ptr, ptr)

declare ptr @mesh_changeset_get_error(ptr, ptr)

declare ptr @mesh_migration_create_table(i64, ptr, ptr)

declare ptr @mesh_migration_drop_table(i64, ptr)

declare ptr @mesh_migration_add_column(i64, ptr, ptr)

declare ptr @mesh_migration_drop_column(i64, ptr, ptr)

declare ptr @mesh_migration_rename_column(i64, ptr, ptr, ptr)

declare ptr @mesh_migration_create_index(i64, ptr, ptr, ptr)

declare ptr @mesh_migration_drop_index(i64, ptr, ptr)

declare ptr @mesh_migration_execute(i64, ptr)

declare i64 @mesh_global_register(ptr, i64, i64)

declare i64 @mesh_global_whereis(ptr, i64)

declare i64 @mesh_global_unregister(ptr, i64)

define {} @identity(i64 %0) {
entry:
  %x = alloca i64, align 8
  store i64 %0, ptr %x, align 8
  %x1 = load i64, ptr %x, align 8
  ret {} zeroinitializer
}

define {} @mesh_main() {
entry:
  %call = call {} @identity(i64 7)
  call void @mesh_reduction_check()
  %call1 = call ptr @mesh_int_to_string(i64 0)
  call void @mesh_println(ptr %call1)
  %str = call ptr @mesh_string_new(ptr @.str, i64 4)
  %ptr_to_i64 = ptrtoint ptr %str to i64
  %call2 = call {} @identity(i64 %ptr_to_i64)
  call void @mesh_reduction_check()
  call void @mesh_println(ptr null)
  ret {} zeroinitializer
}

define i32 @main(i32 %0, ptr %1) {
entry:
  call void @mesh_rt_init()
  call void @mesh_rt_init_actor(i32 0)
  call void @mesh_register_function(ptr @fn_reg_identity, i64 8, ptr @identity)
  call void @mesh_register_function(ptr @fn_reg_mesh_main, i64 9, ptr @mesh_main)
  %2 = call {} @mesh_main()
  call void @mesh_rt_run_scheduler()
  ret i32 0
}

attributes #0 = { noreturn }
