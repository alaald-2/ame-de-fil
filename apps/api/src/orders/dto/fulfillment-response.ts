import { z } from "zod";

// Admin-facing (unlike orderStatusResponseSchema, deliberately minimal for a
// guest-reachable endpoint) — this is what the admin fulfillment actions
// return, echoing the Shipment record they just wrote.
export const fulfillmentResponseSchema = z.object({
  orderId: z.string(),
  status: z.string(),
  shipment: z
    .object({
      status: z.string(),
      carrierName: z.string().nullable(),
      trackingNumber: z.string().nullable(),
      trackingUrl: z.string().nullable(),
      providerShipmentId: z.string().nullable(),
      shippedAt: z.iso.datetime().nullable(),
      deliveredAt: z.iso.datetime().nullable(),
    })
    .nullable(),
});
export type FulfillmentResponse = z.infer<typeof fulfillmentResponseSchema>;
