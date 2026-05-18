export default function CheckoutSuccessPage() {
  return (
    <main className="status-page">
      <section className="status-card">
        <h1>Payment received</h1>
        <p>
          When Paymob sends the confirmed transaction webhook, the server provisions
          your Supabase account and emails your Control Surface license key.
        </p>
        <a className="nav-link" href="/">
          Back to checkout
        </a>
      </section>
    </main>
  );
}
