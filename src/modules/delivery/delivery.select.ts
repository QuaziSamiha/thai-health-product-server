//* SELECT PROJECTIONS FOR THE FLATTENED "External Delivery Service" ADMIN
//* TABLE ROW — ONE DeliveryZone JOINED WITH ITS OWNING DeliveryProvider. SEE
//* docs/delivery.md'S "Conventions" SECTION FOR WHY THE ADMIN TABLE'S FLAT
//* ROWS ARE A JOIN, NOT A DIRECT MAP OF ONE TABLE.

export const DELIVERY_PROVIDER_SUMMARY_SELECT = {
  id: true,
  sid: true,
  name: true,
  phone: true,
  officeLocation: true,
  status: true,
} as const;

export const DELIVERY_ZONE_ROW_SELECT = {
  id: true,
  sid: true,
  serviceName: true,
  areaName: true,
  minDeliveryDays: true,
  maxDeliveryDays: true,
  baseFee: true,
  codAvailable: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  providerId: true,
  provider: {
    select: DELIVERY_PROVIDER_SUMMARY_SELECT,
  },
} as const;
