interface SuccessPageProps {
  searchParams: Promise<{
    provisioned?: string;
  }>;
}

export default async function CheckoutSuccessPage({ searchParams }: SuccessPageProps) {
  const params = await searchParams;
  const provisioned = params.provisioned === 'created' || params.provisioned === 'already_processed';

  return (
    <main className="status-page">
      <section className="status-card">
        <h1>{provisioned ? 'License ready' : 'Payment received'}</h1>
        <p>
          {provisioned
            ? 'Your Control Surface license has been provisioned. Check your email for the activation key.'
            : 'When Paymob sends the confirmed transaction webhook, the server provisions your Supabase account and emails your Control Surface license key.'}
        </p>
        <a className="nav-link" href="/">
          Back to checkout
        </a>
      </section>
    </main>
  );
}
