// src/modules/razorpay/index.ts
import RazorpayProviderService from "./service";
import { ModuleProvider, Modules } from "@medusajs/framework/utils";

export default ModuleProvider(Modules.PAYMENT, {
  services: [RazorpayProviderService],
});
