// ShippingProvider — real-time carrier rates, label purchase, tracking,
// and label voiding. Shippo, EasyPost, future direct-carrier integrations
// implement this. Sparx Shipping is a white-label wrapper over Shippo.

import type { RateOption, ShipmentRequest } from '@sparx/commerce-schemas';

import type { ProviderRunContext } from './context';
import type { ProviderMetadataDescriptor } from './metadata';

export interface ShippingLabel {
  labelRef: string;
  trackingNumber: string;
  trackingUrl: string;
  carrier: string;
  service: string;
  costCents: number;
  /** Base64-encoded PDF/PNG payload. The caller uploads it to GCS via
   *  the media service and stores the resulting mediaAssetId on the
   *  order_fulfillment row. */
  labelImageBase64: string;
  labelImageFormat: 'pdf' | 'png' | 'zpl';
}

export interface TrackingStatus {
  status:
    | 'pre_transit'
    | 'in_transit'
    | 'out_for_delivery'
    | 'delivered'
    | 'returned'
    | 'failure'
    | 'unknown';
  carrierStatusText: string;
  lastEventAt: string;
  estimatedDeliveryAt?: string;
  events: {
    at: string;
    status: string;
    location?: string;
    description: string;
  }[];
}

export interface ShippingProvider {
  readonly metadata: ProviderMetadataDescriptor;

  rateShipment(ctx: ProviderRunContext, request: ShipmentRequest): Promise<RateOption[]>;

  buyLabel(
    ctx: ProviderRunContext,
    input: { rateRef: string } | { request: ShipmentRequest; service: string; carrier: string }
  ): Promise<ShippingLabel>;

  track(
    ctx: ProviderRunContext,
    input: { trackingNumber: string; carrier: string }
  ): Promise<TrackingStatus>;

  voidLabel(ctx: ProviderRunContext, labelRef: string): Promise<void>;
}
