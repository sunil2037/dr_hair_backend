import { BadRequestError, ServiceUnavailableError, BadGatewayError } from '../../../shared/errors/index.js';

const API_BASES = Object.freeze({
  production: 'https://apiv2.shiprocket.in/v1/external',
  sandbox: 'https://api-sandbox.shiprocket.in/v1/external',
});
const TOKEN_REFRESH_MARGIN_MS = 30 * 60 * 1000;
const cachedTokens = new Map();
const trackingCache = new Map();

function positiveNumber(name) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export class ShiprocketService {
  getConfiguration() {
    const defaultEnvironment = process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
    const environment = process.env.SHIPROCKET_API_ENV?.trim().toLowerCase() || defaultEnvironment;
    const apiBase = API_BASES[environment] || '';
    const email = environment === 'sandbox'
      ? process.env.SHIPROCKET_SANDBOX_API_EMAIL?.trim() || ''
      : environment === 'production'
        ? process.env.SHIPROCKET_API_EMAIL?.trim() || ''
        : '';
    const password = environment === 'sandbox'
      ? process.env.SHIPROCKET_SANDBOX_API_PASSWORD || ''
      : environment === 'production'
        ? process.env.SHIPROCKET_API_PASSWORD || ''
        : '';
    const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION?.trim() || '';
    const length = positiveNumber('SHIPROCKET_PACKAGE_LENGTH_CM');
    const breadth = positiveNumber('SHIPROCKET_PACKAGE_BREADTH_CM');
    const height = positiveNumber('SHIPROCKET_PACKAGE_HEIGHT_CM');
    const weight = positiveNumber('SHIPROCKET_PACKAGE_WEIGHT_KG');

    return {
      environment,
      apiBase,
      email,
      password,
      pickupLocation,
      package: { length, breadth, height, weight },
      configured: Boolean(apiBase && email && password && pickupLocation && length && breadth && height && weight),
    };
  }

  assertConfigured() {
    if (!this.getConfiguration().configured) {
      throw new ServiceUnavailableError(
        'Shiprocket setup is incomplete. Finish Shiprocket KYC, create an API user, and configure pickup location and parcel dimensions.',
        null,
        'SHIPROCKET_NOT_CONFIGURED',
      );
    }
  }

  validateOrder(order) {
    this.assertConfigured();
    this.buildForwardShipmentPayload(order, this.getConfiguration());
  }

  async createForwardShipment(order) {
    this.assertConfigured();
    const config = this.getConfiguration();
    const payload = this.buildForwardShipmentPayload(order, config);
    const token = await this.getToken(config);
    const response = await this.request(config.apiBase, '/shipments/create/forward-shipment', token, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const result = response?.payload || response?.data || response;
    const shipmentId = result?.shipment_id || result?.shipmentId;
    const awbCode = result?.awb_code || result?.awb || result?.awbCode;

    if (!shipmentId || !awbCode) {
      throw new BadGatewayError(
        'Shiprocket did not return both a shipment ID and AWB. Check the Shiprocket panel before retrying this order.',
        null,
        'SHIPROCKET_INCOMPLETE_RESPONSE',
      );
    }

    return {
      shiprocketOrderId: String(result.order_id || result.orderId || ''),
      shipmentId: String(shipmentId),
      awbCode: String(awbCode),
      courierName: String(result.courier_name || result.courier || ''),
      courierId: result.courier_company_id ? String(result.courier_company_id) : '',
      pickupScheduledAt: result.pickup_scheduled_date || null,
      labelUrl: result.label_url || null,
      manifestUrl: result.manifest_url || null,
    };
  }

  async trackShipment({ awbCode, shipmentId }) {
    const config = this.getConfiguration();
    if (!config.apiBase || !config.email || !config.password) {
      throw new ServiceUnavailableError(
        'Shiprocket tracking credentials are not configured for the selected environment.',
        null,
        'SHIPROCKET_NOT_CONFIGURED',
      );
    }

    const awb = String(awbCode || '').trim();
    const shipment = String(shipmentId || '').trim();
    if (!awb && !shipment) throw new BadRequestError('A Shiprocket AWB or shipment ID is required.');

    const identifier = awb || shipment;
    const cacheKey = `${config.environment}:${awb ? 'awb' : 'shipment'}:${identifier}`;
    const cached = trackingCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const token = await this.getToken(config);
    const path = awb
      ? `/courier/track/awb/${encodeURIComponent(awb)}`
      : `/courier/track/shipment/${encodeURIComponent(shipment)}`;
    const response = await this.request(config.apiBase, path, token, { method: 'GET' });
    const tracking = this.normalizeTracking(response, identifier);
    trackingCache.set(cacheKey, { value: tracking, expiresAt: Date.now() + 30_000 });
    return tracking;
  }

  normalizeTracking(response, identifier) {
    let data = response?.tracking_data || response?.data?.tracking_data || response?.data || response;
    if (data && !data.shipment_track && !data.shipment_track_activities) {
      const nested = Object.values(data).find((value) => value?.tracking_data);
      if (nested) data = nested.tracking_data;
    }

    const shipment = Array.isArray(data?.shipment_track) ? data.shipment_track[0] : data?.shipment_track || {};
    const activities = Array.isArray(data?.shipment_track_activities)
      ? data.shipment_track_activities
      : [];

    return {
      awb_code: String(shipment.awb_code || identifier),
      courier: String(shipment.courier_name || ''),
      current_status: String(shipment.current_status || data?.current_status || ''),
      current_status_id: shipment.current_status_id ?? data?.shipment_status ?? null,
      estimated_delivery: String(shipment.edd || shipment.etd || data?.edd || ''),
      origin: String(shipment.origin || ''),
      destination: String(shipment.destination || shipment.delivered_to || ''),
      track_url: String(data?.track_url || shipment.track_url || ''),
      updated_at: String(shipment.updated_time_stamp || activities[0]?.date || ''),
      events: activities.map((event) => ({
        date: String(event.date || ''),
        status: String(event['sr-status-label'] || event.status || ''),
        activity: String(event.activity || event.status || ''),
        location: String(event.location || ''),
      })),
    };
  }

  buildForwardShipmentPayload(order, config) {
    const orderId = String(order.order_id || '').trim();
    const address = order.shipping_address || {};
    const customerName = String(order.customer?.name || address.name || '').trim();
    const phone = String(order.customer?.phone || address.phone || '').replace(/[^0-9]/g, '');
    const email = String(order.customer?.email || '').trim();
    const addressLine = [address.house_number, address.street].filter(Boolean).join(', ').trim();
    const paymentMethod = order.payment?.gateway === 'cod' ? 'COD' : 'Prepaid';
    const packageSize = config.package;

    if (!orderId || orderId.length > 20) {
      throw new BadRequestError('Order ID is not valid for Shiprocket (maximum 20 characters).');
    }
    if (!customerName || !phone || !email || !addressLine || !address.city || !address.state || !address.pincode) {
      throw new BadRequestError('This order is missing customer or delivery address details required by Shiprocket.');
    }

    const subtotal = Math.max(0, Number(order.pricing?.subtotal || 0) - Number(order.pricing?.discount || 0));
    if (subtotal <= 0) throw new BadRequestError('Shiprocket requires a positive order value.');

    return {
      order_id: orderId,
      order_date: new Date(order.created_at || Date.now()).toISOString().slice(0, 10),
      pickup_location: config.pickupLocation,
      billing_customer_name: customerName,
      billing_last_name: '',
      billing_address: addressLine.slice(0, 190),
      billing_address_2: '',
      billing_city: String(address.city).trim(),
      billing_pincode: String(address.pincode).trim(),
      billing_state: String(address.state).trim(),
      billing_country: 'India',
      billing_email: email,
      billing_phone: phone,
      shipping_is_billing: true,
      order_items: (order.items || []).map((item) => ({
        name: String(item.title || item.name || 'Product').slice(0, 100),
        sku: String(item.product_id || item.sku || orderId).slice(0, 50),
        units: Math.max(1, Number(item.quantity) || 1),
        selling_price: Number(item.price) || 0,
      })),
      payment_method: paymentMethod,
      sub_total: subtotal,
      length: packageSize.length,
      breadth: packageSize.breadth,
      height: packageSize.height,
      weight: packageSize.weight,
      declared_value: Math.max(1, Math.round(Number(order.pricing?.total || subtotal))),
      is_return: 0,
      request_pickup: true,
      print_label: true,
      generate_manifest: true,
    };
  }

  async getToken(config) {
    const cacheKey = `${config.environment}:${config.email}`;
    const cachedToken = cachedTokens.get(cacheKey);
    if (cachedToken && cachedToken.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS) {
      return cachedToken.value;
    }

    const response = await this.request(config.apiBase, '/auth/login', null, {
      method: 'POST',
      body: JSON.stringify({ email: config.email, password: config.password }),
    });
    const token = response?.token;
    if (!token || typeof token !== 'string') {
      throw new BadGatewayError('Shiprocket authentication failed. Check the API user credentials.');
    }

    cachedTokens.set(cacheKey, { value: token, expiresAt: Date.now() + (9 * 24 * 60 * 60 * 1000) });
    return token;
  }

  async request(apiBase, path, token, options) {
    let response;
    try {
      response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      const error = new BadGatewayError('Could not reach Shiprocket. Check the connection and Shiprocket service status.');
      error.retrySafe = false;
      throw error;
    }

    const responseBody = await response.json().catch(() => null);
    if (!response.ok) {
      const message = String(responseBody?.message || responseBody?.errors?.message || '').trim();
      const error = new BadGatewayError(
        message ? `Shiprocket rejected the request: ${message}` : `Shiprocket request failed with status ${response.status}.`,
        null,
        'SHIPROCKET_REQUEST_FAILED',
      );
      error.retrySafe = response.status >= 400 && response.status < 500;
      throw error;
    }
    return responseBody;
  }
}
