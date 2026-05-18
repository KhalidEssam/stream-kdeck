export default function CheckoutFailurePage() {
  return (
    <main className="status-page">
      <section className="status-card">
        <h1>Payment not completed</h1>
        <p>
          The transaction was cancelled or declined. You can return to checkout and
          try again with another payment method.
        </p>
        <a className="nav-link" href="/">
          Back to checkout
        </a>
      </section>
    </main>
  );
}
