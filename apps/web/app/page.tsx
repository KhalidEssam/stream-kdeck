import { PurchasePanel } from './purchase-panel';

export default function HomePage() {
  return (
    <main className="page">
      <div className="shell">
        <nav className="nav" aria-label="Primary">
          <div className="brand">Control Surface</div>
          <a className="nav-link" href="/checkout/success">
            Purchase help
          </a>
        </nav>

        <section className="hero">
          <div>
            <p className="eyebrow">Desktop license + AI credits</p>
            <h1 className="headline">Control Surface checkout</h1>
            <p className="summary">
              Buy a desktop license, unlock the mobile deck, and receive an activation
              key by email after Paymob confirms payment.
            </p>

            <div className="metrics" aria-label="Plan summary">
              <div className="metric">
                <strong>$19</strong>
                <span>one-time desktop license</span>
              </div>
              <div className="metric">
                <strong>50</strong>
                <span>included AI calls each month</span>
              </div>
              <div className="metric">
                <strong>500</strong>
                <span>AI Pro monthly credits</span>
              </div>
            </div>
          </div>

          <PurchasePanel />
        </section>
      </div>
    </main>
  );
}
