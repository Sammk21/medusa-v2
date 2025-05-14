import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  // modules: [
  //   {
  //     resolve: "@medusajs/medusa/payment",
  //     options: {
  //       providers: [
  //         {
  //           resolve: "payment-razorpay",
  //           id: "razorpay",
  //           options: {
  //             key_id:
  //               process?.env?.RAZORPAY_TEST_KEY_ID ?? process?.env?.RAZORPAY_ID,
  //             key_secret:
  //               process?.env?.RAZORPAY_TEST_KEY_SECRET ??
  //               process?.env?.RAZORPAY_SECRET,
  //             razorpay_account:
  //               process?.env?.RAZORPAY_TEST_ACCOUNT ??
  //               process?.env?.RAZORPAY_ACCOUNT,
  //             automatic_expiry_period: 30 /* any value between 12minuts and 30 days expressed in minutes*/,
  //             manual_expiry_period: 20,
  //             refund_speed: "normal",
  //             webhook_secret:
  //               process?.env?.RAZORPAY_TEST_WEBHOOK_SECRET ??
  //               process?.env?.RAZORPAY_WEBHOOK_SECRET,
  //           },
  //         },
  //       ],
  //     },
  //   },
  // ],
  modules: [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/razorpay",
            id: "razorpay",
            options: {
              key_id: "rzp_test_z0wY0NRo0U6tBz",
              key_secret: process?.env?.RAZORPAY_SECRET,
              webhook_secret: process?.env?.RAZORPAY_TEST_WEBHOOK_SECRET, // Optional, for verifying webhooks
            },
          },
        ],
      },
    },
  ],

  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
});
