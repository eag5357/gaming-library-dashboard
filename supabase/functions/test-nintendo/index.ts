Deno.serve(async (req) => {
  return new Response(JSON.stringify({ success: true, message: "Simple boot test" }), {
    headers: { "Content-Type": "application/json" }
  });
});
