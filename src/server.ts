import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { InMemoryRentalStore } from './store.ts';
import { getStripe } from './stripe.ts';

const config = loadConfig();
const app = createApp({
  stripe: getStripe(config.stripeSecretKey),
  config,
  store: new InMemoryRentalStore(),
  onRentalPaid: async (rental) => {
    // TODO: send confirmation email and reserve gear for each child.
    console.log(`[rental] paid ${rental.checkoutSessionId} (${rental.children.length} children)`);
  },
  onRentalPaymentFailed: async (rental) => {
    // TODO: email the customer to retry payment.
    console.log(`[rental] payment failed ${rental.checkoutSessionId}`);
  },
});

app.listen(config.port, () => {
  console.log(`Slopecycle payments listening on http://localhost:${config.port}`);
});
