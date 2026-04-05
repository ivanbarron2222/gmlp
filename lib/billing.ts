export type BillingPaymentMethod = 'Cash' | 'Card' | 'HMO' | 'E-Wallet';

export interface BillingLineItem {
  id: string;
  name: string;
  amount: number;
}

export interface BillingRecord {
  lineItems: BillingLineItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: BillingPaymentMethod;
  paymentStatus: 'unpaid' | 'paid';
  paidAt?: string;
}

export type CatalogService = BillingLineItem & {
  category: string;
  isActive?: boolean;
  sortOrder?: number;
};

export const billingCatalog: CatalogService[] = [
  { id: 'svc-pre-employment', name: 'Pre-Employment Package', amount: 850, category: 'Packages' },
  { id: 'svc-checkup', name: 'Doctor Check-Up Consultation', amount: 500, category: 'Consultation' },
  { id: 'svc-blood-test', name: 'Blood Test Service', amount: 250, category: 'Laboratory' },
  { id: 'svc-drug-test', name: 'Drug Test Service', amount: 350, category: 'Laboratory' },
  { id: 'svc-xray', name: 'Xray Service', amount: 650, category: 'Imaging' },
  { id: 'svc-ecg', name: 'ECG Service', amount: 450, category: 'Diagnostics' },
];

export const paymentMethods: BillingPaymentMethod[] = ['Cash', 'Card', 'HMO', 'E-Wallet'];

export function buildDefaultLineItems(
  serviceType: string,
  requestedLabService: string,
  completedLanes: string[],
  catalog: CatalogService[] = billingCatalog
) {
  if (serviceType === 'Pre-Employment') {
    return catalog.filter((item) => item.id === 'svc-pre-employment');
  }

  if (serviceType === 'Check-Up') {
    const defaults = catalog.filter((item) => item.id === 'svc-checkup');
    const referrals = completedLanes
      .map((lane) => {
        switch (lane) {
          case 'BLOOD TEST':
            return catalog.find((item) => item.id === 'svc-blood-test');
          case 'DRUG TEST':
            return catalog.find((item) => item.id === 'svc-drug-test');
          case 'XRAY':
            return catalog.find((item) => item.id === 'svc-xray');
          case 'ECG':
            return catalog.find((item) => item.id === 'svc-ecg');
          default:
            return null;
        }
      })
      .filter(Boolean) as CatalogService[];

    return [...defaults, ...referrals];
  }

  switch (requestedLabService) {
    case 'Blood Test':
      return catalog.filter((item) => item.id === 'svc-blood-test');
    case 'Drug Test':
      return catalog.filter((item) => item.id === 'svc-drug-test');
    case 'Xray':
      return catalog.filter((item) => item.id === 'svc-xray');
    case 'ECG':
      return catalog.filter((item) => item.id === 'svc-ecg');
    default:
      return [];
  }
}

export function uiPaymentMethodToDb(paymentMethod: BillingPaymentMethod) {
  switch (paymentMethod) {
    case 'Cash':
      return 'cash';
    case 'Card':
      return 'card';
    case 'E-Wallet':
      return 'gcash';
    case 'HMO':
    default:
      return 'other';
  }
}

export function dbPaymentMethodToUi(paymentMethod: string | null | undefined): BillingPaymentMethod {
  switch (paymentMethod) {
    case 'cash':
      return 'Cash';
    case 'card':
      return 'Card';
    case 'gcash':
      return 'E-Wallet';
    case 'other':
    case 'bank_transfer':
    default:
      return 'HMO';
  }
}
