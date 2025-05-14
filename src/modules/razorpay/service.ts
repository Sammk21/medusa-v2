// src/modules/razorpay/service.ts


import { AbstractPaymentProvider } from "@medusajs/framework/utils";
import {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/utils";
import Razorpay from "razorpay";
import { BigNumber } from "@medusajs/framework/utils";
import crypto from "crypto";

type RazorpayOptions = {
  key_id: string;
  key_secret: string;
  webhook_secret?: string;
};

type InjectedDependencies = {
  logger: Logger;
};

class RazorpayProviderService extends AbstractPaymentProvider<RazorpayOptions> {
  static identifier = "razorpay";
  protected logger_: Logger;
  protected options_: RazorpayOptions;
  protected client_: Razorpay;

  constructor(container: InjectedDependencies, options: RazorpayOptions) {
    super(container, options);

    this.logger_ = container.logger;
    this.options_ = options;

    this.client_ = new Razorpay({
      key_id: options.key_id,
      key_secret: options.key_secret,
    });

    console.log("Razorpay Key ID:", this.options_.key_id);
    console.log(
      "Razorpay Key Secret:",
      this.options_.key_secret ? "Loaded" : "Not Set"
    );
  }

  

  static validateOptions(options: Record<string, unknown>) {
    if (!options.key_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "key_id is required for Razorpay provider"
      );
    }

    if (!options.key_secret) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "key_secret is required for Razorpay provider"
      );
    }
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    try {
      console.log("input", input);
      const { amount, currency_code, data } = input;

      // Razorpay requires amount in smallest currency unit (e.g., paise for INR)
      // Convert amount to appropriate unit and format
      const paymentAmount = parseInt((amount * 100).toFixed(0));

      // Create order in Razorpay
      const orderPayload: Razorpay.OrderCreateRequestBody = {
        amount: paymentAmount,
        currency: currency_code.toUpperCase(),
        receipt: `medusa_${Date.now()}`,
        notes: {
          medusa_payment_provider: "razorpay",
        },
      };

      // Add metadata if customer exists in data
      // if (data?.customer) {
      //   orderPayload.notes.customer_id = data.customer.customer_id;
      //   orderPayload.notes.customer_email = data.customer.customer_email;
      // }

      console.log("orderpayload", orderPayload);

      const razorpayOrder = await this.client_.orders.create(orderPayload);


      console.log("razorpay",razorpayOrder)

      // Return Razorpay order data
      return {
        id: razorpayOrder.id,
        data: razorpayOrder,
      };
    } catch (error: any) {
      const errorData = error?.error || error;

      const detailedMessage =
        errorData?.description ||
        errorData?.message ||
        errorData?.error?.description ||
        JSON.stringify(errorData);

      this.logger_.error(
        `Failed to initiate Razorpay payment: ${detailedMessage}`
      );

      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to initiate Razorpay payment: ${detailedMessage}`
      );
    }

  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    try {
      const { data } = input;

      // In Razorpay, once payment is made against an order, we need to verify it
      // This usually happens through webhook or client-side redirect with payment details

      // If we have razorpay_payment_id and razorpay_signature in data,
      // it means the payment has been made and needs to be verified
      if (data?.razorpay_payment_id && data?.razorpay_signature) {
        const orderId = data.razorpay_order_id as string;
        const paymentId = data.razorpay_payment_id as string;
        const signature = data.razorpay_signature as string;

        // Verify signature
        const payload = `${orderId}|${paymentId}`;
        const isValid = this.verifySignature(payload, signature);

        if (!isValid) {
          return {
            status: "error",
            data: {
              ...data,
              error: "Invalid payment signature",
            },
          };
        }

        // Fetch payment details from Razorpay
        const payment = await this.client_.payments.fetch(paymentId);

        // Check if the payment was authorized
        if (payment.status === "authorized" || payment.status === "captured") {
          return {
            status: payment.status === "captured" ? "captured" : "authorized",
            data: {
              ...data,
              payment_details: payment,
            },
          };
        }

        return {
          status: "pending",
          data: {
            ...data,
            payment_details: payment,
          },
        };
      }

      // If we don't have payment verification data yet, it's pending
      return {
        status: "pending",
        data,
      };
    } catch (error) {
      this.logger_.error(
        `Failed to authorize Razorpay payment: ${error.message}`
      );
      return {
        status: "error",
        data: {
          ...input.data,
          error: error.message,
        },
      };
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    try {
      const { data } = input;

      if (!data?.payment_details?.id) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Payment ID is required to capture payment"
        );
      }

      const paymentId = data.payment_details.id;

      // Capture the payment in Razorpay
      const capturedPayment = await this.client_.payments.capture(
        paymentId,
        data.payment_details.amount
      );

      return {
        data: {
          ...data,
          payment_details: capturedPayment,
        },
      };
    } catch (error) {
      this.logger_.error(
        `Failed to capture Razorpay payment: ${error.message}`
      );
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to capture Razorpay payment: ${error.message}`
      );
    }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    try {
      const { data } = input;

      // Check if there's a payment to cancel
      if (
        data?.payment_details?.id &&
        data.payment_details.status === "authorized"
      ) {
        // In Razorpay, you can't cancel an authorized payment directly
        // Instead, you refund it with full amount
        await this.client_.payments.refund(data.payment_details.id, {
          amount: data.payment_details.amount,
          notes: {
            cancellation_reason: "Payment cancelled by merchant",
          },
        });

        // Get updated payment details
        const updatedPayment = await this.client_.payments.fetch(
          data.payment_details.id
        );

        return {
          data: {
            ...data,
            payment_details: updatedPayment,
          },
        };
      }

      // If there's no payment or it's not in authorized state, just return the data
      return { data };
    } catch (error) {
      this.logger_.error(`Failed to cancel Razorpay payment: ${error.message}`);
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to cancel Razorpay payment: ${error.message}`
      );
    }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    try {
      const { data, amount } = input;

      if (!data?.payment_details?.id) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Payment ID is required to refund payment"
        );
      }

      // Convert amount to smallest currency unit
      const refundAmount = parseInt((amount * 100).toFixed(0));

      // Process refund via Razorpay
      const refundData = await this.client_.payments.refund(
        data.payment_details.id,
        {
          amount: refundAmount,
          notes: {
            refund_reason: "Refund requested by merchant",
          },
        }
      );

      // Return the updated data
      return {
        data: {
          ...data,
          refund_details: refundData,
        },
      };
    } catch (error) {
      this.logger_.error(`Failed to refund Razorpay payment: ${error.message}`);
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to refund Razorpay payment: ${error.message}`
      );
    }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    // In Razorpay, you can't delete orders or payments directly
    // We can just return and let the session be deleted in Medusa
    return {};
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    try {
      const { data } = input;

      // If payment is already processed and we have payment_details
      if (data?.payment_details?.id) {
        const paymentId = data.payment_details.id;
        const payment = await this.client_.payments.fetch(paymentId);

        // Map Razorpay status to Medusa status
        switch (payment.status) {
          case "created":
            return { status: "pending" };
          case "authorized":
            return { status: "authorized" };
          case "captured":
            return { status: "captured" };
          case "failed":
            return { status: "error" };
          default:
            return { status: "pending" };
        }
      }

      // If we only have the order ID but no payment
      if (data?.id) {
        const order = await this.client_.orders.fetch(data.id);

        // If order is paid
        if (order.status === "paid") {
          return { status: "captured" };
        }

        // If order has payments but not fully paid
        if (order.status === "attempted") {
          return { status: "authorized" };
        }

        // Order created but no payment yet
        return { status: "pending" };
      }

      return { status: "pending" };
    } catch (error) {
      this.logger_.error(
        `Failed to get Razorpay payment status: ${error.message}`
      );
      return { status: "error" };
    }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    try {
      const { data } = input;

      // If we have a payment ID
      if (data?.payment_details?.id) {
        const paymentData = await this.client_.payments.fetch(
          data.payment_details.id
        );
        return paymentData;
      }

      // If we only have order ID
      if (data?.id) {
        const orderData = await this.client_.orders.fetch(data.id);
        // Get payments for this order
        const payments = await this.client_.orders.fetchPayments(data.id);

        return {
          order: orderData,
          payments,
        };
      }

      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No valid payment or order ID found"
      );
    } catch (error) {
      this.logger_.error(
        `Failed to retrieve Razorpay payment: ${error.message}`
      );
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to retrieve Razorpay payment: ${error.message}`
      );
    }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    try {
      const { amount, currency_code, data } = input;

      if (!data?.id) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Order ID is required to update payment"
        );
      }

      // Razorpay doesn't allow updating an order amount once created
      // The best approach is to cancel the old order and create a new one

      // Create a new order with updated amount
      const paymentAmount = parseInt((amount * 100).toFixed(0));

      const orderPayload: Razorpay.OrderCreateRequestBody = {
        amount: paymentAmount,
        currency: currency_code.toUpperCase(),
        receipt: `medusa_${Date.now()}`,
        notes: {
          medusa_payment_provider: "razorpay",
          previous_order_id: data.id,
        },
      };

      const razorpayOrder = await this.client_.orders.create(orderPayload);

      // Return new order data
      return {
        id: razorpayOrder.id,
        data: {
          ...razorpayOrder,
          previous_order_id: data.id,
        },
      };
    } catch (error) {
      this.logger_.error(`Failed to update Razorpay payment: ${error.message}`);
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to update Razorpay payment: ${error.message}`
      );
    }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    try {
      const { data, headers, rawData } = payload;

      // Verify webhook signature if webhook_secret is configured
      if (this.options_.webhook_secret) {
        const signature = headers["x-razorpay-signature"] as string;
        if (
          !signature ||
          !this.verifyWebhookSignature(rawData.toString(), signature)
        ) {
          return {
            action: "failed",
            data: {
              message: "Invalid webhook signature",
            },
          };
        }
      }

      // Process webhook event based on event type
      switch (data.event) {
        case "payment.authorized":
          return {
            action: "authorized",
            data: {
              session_id: data.payload.payment.entity.order_id,
              amount: new BigNumber(data.payload.payment.entity.amount / 100),
            },
          };

        case "payment.captured":
          return {
            action: "captured",
            data: {
              session_id: data.payload.payment.entity.order_id,
              amount: new BigNumber(data.payload.payment.entity.amount / 100),
            },
          };

        case "refund.processed":
          return {
            action: "refunded",
            data: {
              session_id: data.payload.refund.entity.payment_id,
              amount: new BigNumber(data.payload.refund.entity.amount / 100),
            },
          };

        case "payment.failed":
          return {
            action: "failed",
            data: {
              session_id: data.payload.payment.entity.order_id,
              amount: new BigNumber(data.payload.payment.entity.amount / 100),
              error:
                data.payload.payment.entity.error_description ||
                "Payment failed",
            },
          };

        default:
          return {
            action: "not_supported",
          };
      }
    } catch (error) {
      this.logger_.error(
        `Failed to process Razorpay webhook: ${error.message}`
      );
      return {
        action: "failed",
        data: {
          message: `Error processing webhook: ${error.message}`,
        },
      };
    }
  }

  // Helper methods
  private verifySignature(payload: string, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac("sha256", this.options_.key_secret)
      .update(payload)
      .digest("hex");

    return expectedSignature === signature;
  }

  private verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.options_.webhook_secret) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac("sha256", this.options_.webhook_secret)
      .update(payload)
      .digest("hex");

    return expectedSignature === signature;
  }
}

export default RazorpayProviderService;
