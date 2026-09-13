#!/bin/sh

set -eu

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

gateway_secret="${COMMERCE_GATEWAY_SECRET:-local-gateway-secret-change-before-sharing}"
run_dir="$(mktemp -d)"
cookie_jar="${run_dir}/cookies.txt"

new_uuid() {
  node -e 'console.log(crypto.randomUUID())'
}

reset_catalog() {
  docker compose run --rm --entrypoint wp wp-setup eval '
    foreach (wc_get_orders(["limit" => -1, "status" => "pending"]) as $order) {
      if (str_ends_with($order->get_billing_email(), "@verification.test")) {
        $order->update_status("cancelled", "Runtime verification cleanup.");
      }
    }
  ' --allow-root >/dev/null 2>&1 || true
  docker compose run --rm --entrypoint wp wp-setup \
    commerce-reference seed --allow-root >/dev/null 2>&1 || true
}

wp_eval() {
  docker compose run --rm --entrypoint wp wp-setup \
    eval "$1" --allow-root 2>/dev/null
}

cleanup() {
  reset_catalog
  rm -rf "${run_dir}"
}
trap cleanup EXIT

reset_catalog
mail_before="$(
  curl -fsS http://127.0.0.1:8025/api/v1/messages | jq -r '.total'
)"
cart_created="$(
  curl -fsS \
  -c "${cookie_jar}" \
  -b "${cookie_jar}" \
  -H 'content-type: application/json' \
  --data '{"sku":"NS-LIGHT-002"}' \
    http://localhost:3000/api/cart
)"
test "$(echo "${cart_created}" | jq -r '.lines[0].capturedPrice')" = "72.00"

wp_eval '
  $product = wc_get_product(wc_get_product_id_by_sku("NS-LIGHT-002"));
  $product->set_regular_price("79");
  $product->set_price("79");
  $product->save();
' >/dev/null
stock_before="$(wp_eval '
  $product = wc_get_product(wc_get_product_id_by_sku("NS-LIGHT-002"));
  echo $product->get_stock_quantity();
')"

checkout_key="$(new_uuid)"
checkout_body="$(
  jq -nc \
    --arg key "${checkout_key}" \
    '{email:"buyer@verification.test",idempotencyKey:$key}'
)"
checkout="$(
  curl -fsS \
    -c "${cookie_jar}" \
    -b "${cookie_jar}" \
    -H 'content-type: application/json' \
    --data "${checkout_body}" \
    http://localhost:3000/api/checkout
)"
checkout_replay="$(
  curl -fsS \
    -c "${cookie_jar}" \
    -b "${cookie_jar}" \
    -H 'content-type: application/json' \
    --data "${checkout_body}" \
    http://localhost:3000/api/checkout
)"
reference="$(echo "${checkout}" | jq -r '.order.reference')"

echo "${checkout}" | jq -e '
  .paymentMode == "simulator" and
  .order.status == "pending" and
  .order.amount == "79.00" and
  ([.order.timeline[].type] | index("stock.reserved") != null)
' >/dev/null
test "$(echo "${checkout_replay}" | jq -r '.order.reference')" = "${reference}"

cart_id="$(
  awk '$6 == "northstar_cart" { print $7 }' "${cookie_jar}"
)"
changed_status="$(
  curl -sS \
    -o "${run_dir}/changed-replay.json" \
    -w '%{http_code}' \
    -H "x-commerce-gateway-secret: ${gateway_secret}" \
    -H 'content-type: application/json' \
    --data "$(
      jq -nc \
        --arg key "${checkout_key}" \
        --arg cart "${cart_id}" \
        '{idempotencyKey:$key,cartId:$cart,email:"changed@verification.test",lines:[{sku:"NS-LIGHT-002",quantity:1}]}'
    )" \
    http://localhost:8080/wp-json/commerce-reference/v1/checkouts
)"
test "${changed_status}" = "409"
jq -e '.error | contains("already used")' \
  "${run_dir}/changed-replay.json" >/dev/null

paid="$(
  curl -fsS \
    -c "${cookie_jar}" \
    -b "${cookie_jar}" \
    -X POST \
    "http://localhost:3000/api/orders/${reference}/confirm"
)"
paid_replay="$(
  curl -fsS \
    -c "${cookie_jar}" \
    -b "${cookie_jar}" \
    -X POST \
    "http://localhost:3000/api/orders/${reference}/confirm"
)"
order="$(
  curl -fsS \
    -c "${cookie_jar}" \
    -b "${cookie_jar}" \
    "http://localhost:3000/api/orders/${reference}"
)"
cart="$(curl -fsS -b "${cookie_jar}" http://localhost:3000/api/cart)"

echo "${paid}" | jq -e '
  .order.status == "processing" and
  ([.order.timeline[].type] | index("payment.succeeded") != null)
' >/dev/null
echo "${paid_replay}" | jq -e '
  [.order.timeline[] | select(.type == "payment.succeeded")] | length == 1
' >/dev/null
echo "${order}" | jq -e '
  .paymentMode == "simulator" and
  .order.status == "processing"
' >/dev/null
test "$(echo "${cart}" | jq -r '.itemCount')" = "0"
stock_after="$(wp_eval '
  $product = wc_get_product(wc_get_product_id_by_sku("NS-LIGHT-002"));
  echo $product->get_stock_quantity();
')"
test "${stock_after}" -eq "$((stock_before - 1))"

mail_after="$(
  curl -fsS http://127.0.0.1:8025/api/v1/messages | jq -r '.total'
)"
test "${mail_after}" -gt "${mail_before}"

failure_key="$(new_uuid)"
failure_cart="$(new_uuid)"
failure_intent="pi_sim_failure_$(new_uuid)"
failure_checkout="$(
  curl -fsS \
    -H "x-commerce-gateway-secret: ${gateway_secret}" \
    -H 'content-type: application/json' \
    --data "$(
      jq -nc \
        --arg key "${failure_key}" \
        --arg cart "${failure_cart}" \
        '{idempotencyKey:$key,cartId:$cart,email:"failure@verification.test",lines:[{sku:"NS-MUG-003",quantity:1}]}'
    )" \
    http://localhost:8080/wp-json/commerce-reference/v1/checkouts
)"
failure_reference="$(echo "${failure_checkout}" | jq -r '.reference')"
curl -fsS \
  -H "x-commerce-gateway-secret: ${gateway_secret}" \
  -H 'content-type: application/json' \
  --data "$(
    jq -nc \
      --arg cart "${failure_cart}" \
      --arg intent "${failure_intent}" \
      '{cartId:$cart,paymentIntentId:$intent}'
  )" \
  "http://localhost:8080/wp-json/commerce-reference/v1/orders/${failure_reference}/payment" \
  >/dev/null
held_before_failure="$(wp_eval '
  $product = wc_get_product(wc_get_product_id_by_sku("NS-MUG-003"));
  echo wc_get_held_stock_quantity($product);
')"
test "${held_before_failure}" -eq 1
failure_event="$(
  curl -fsS \
    -H "x-commerce-gateway-secret: ${gateway_secret}" \
    -H 'content-type: application/json' \
    --data "$(
      jq -nc \
        --arg event "evt_failure_$(new_uuid)" \
        --arg intent "${failure_intent}" \
        '{providerEventId:$event,paymentIntentId:$intent,type:"payment_intent.payment_failed",amount:3400,currency:"usd"}'
    )" \
    http://localhost:8080/wp-json/commerce-reference/v1/payment-events
)"
echo "${failure_event}" | jq -e '
  .duplicate == false and
  .order.status == "failed" and
  ([.order.timeline[].type] | index("payment.failed") != null)
' >/dev/null
held_after_failure="$(wp_eval '
  $product = wc_get_product(wc_get_product_id_by_sku("NS-MUG-003"));
  echo wc_get_held_stock_quantity($product);
')"
test "${held_after_failure}" -eq 0

docker compose run --rm --entrypoint wp wp-setup eval '
  $product = wc_get_product(wc_get_product_id_by_sku("NS-SHELL-004"));
  $product->set_manage_stock(true);
  $product->set_stock_quantity(1);
  $product->set_stock_status("instock");
  $product->save();
' --allow-root >/dev/null

key_one="$(new_uuid)"
key_two="$(new_uuid)"
cart_one="$(new_uuid)"
cart_two="$(new_uuid)"
jq -nc \
  --arg key "${key_one}" \
  --arg cart "${cart_one}" \
  '{idempotencyKey:$key,cartId:$cart,email:"one@verification.test",lines:[{sku:"NS-SHELL-004",quantity:1}]}' \
  >"${run_dir}/payload-1.json"
jq -nc \
  --arg key "${key_two}" \
  --arg cart "${cart_two}" \
  '{idempotencyKey:$key,cartId:$cart,email:"two@verification.test",lines:[{sku:"NS-SHELL-004",quantity:1}]}' \
  >"${run_dir}/payload-2.json"

curl -sS \
  -o "${run_dir}/response-1.json" \
  -w '%{http_code}' \
  -H "x-commerce-gateway-secret: ${gateway_secret}" \
  -H 'content-type: application/json' \
  --data-binary "@${run_dir}/payload-1.json" \
  http://localhost:8080/wp-json/commerce-reference/v1/checkouts \
  >"${run_dir}/status-1" &
pid_one=$!
curl -sS \
  -o "${run_dir}/response-2.json" \
  -w '%{http_code}' \
  -H "x-commerce-gateway-secret: ${gateway_secret}" \
  -H 'content-type: application/json' \
  --data-binary "@${run_dir}/payload-2.json" \
  http://localhost:8080/wp-json/commerce-reference/v1/checkouts \
  >"${run_dir}/status-2" &
pid_two=$!
wait "${pid_one}"
wait "${pid_two}"

status_one="$(cat "${run_dir}/status-1")"
status_two="$(cat "${run_dir}/status-2")"
case "${status_one}:${status_two}" in
  201:409)
    winner=1
    ;;
  409:201)
    winner=2
    ;;
  *)
    echo "Expected one 201 and one 409, got ${status_one} and ${status_two}." >&2
    exit 1
    ;;
esac

winner_reference="$(
  jq -r '.reference' "${run_dir}/response-${winner}.json"
)"
winner_cart="$(
  jq -r '.cartId' "${run_dir}/payload-${winner}.json"
)"
curl -fsS \
  -H "x-commerce-gateway-secret: ${gateway_secret}" \
  -H 'content-type: application/json' \
  --data "$(jq -nc --arg cart "${winner_cart}" '{cartId:$cart}')" \
  "http://localhost:8080/wp-json/commerce-reference/v1/orders/${winner_reference}/cancel" \
  | jq -e '.status == "cancelled"' \
  >/dev/null

printf '%s\n' "Checkout repricing, idempotency, payment outcomes, email, and stock contention verified."
