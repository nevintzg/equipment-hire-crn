import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { useSite } from './site.jsx';
import { useBasket } from './basket.jsx';
import { useAuth } from './auth.jsx';

/** Location slots plus a live server quote for the current basket. */
export function useHireWindow() {
  const site = useSite();
  const basket = useBasket();
  const { signedIn } = useAuth();
  const location =
    site.locations.find((l) => l.id === basket.pickupLocationId) ??
    site.locations.find((l) => l.isDefault) ??
    site.locations[0];

  const slots = useQuery({
    queryKey: ['site', 'slots', location?.id],
    queryFn: () => api.get(`/site/locations/${location.id}/slots`),
    enabled: Boolean(location),
    staleTime: 300_000,
  });

  const ready = basket.items.length > 0 && basket.startDate && basket.endDate;
  const body = {
    items: basket.items.map((i) => ({ equipmentId: i.equipmentId, quantity: i.quantity })),
    startDate: basket.startDate,
    endDate: basket.endDate,
    startTime: basket.startTime,
    endTime: basket.endTime,
    pickupLocationId: location?.id,
  };

  const quote = useQuery({
    queryKey: ['quote', body],
    queryFn: () => api.post('/bookings/quote', body),
    enabled: Boolean(ready && signedIn),
    staleTime: 30_000,
    retry: false,
  });

  return { location, slots: slots.data ?? [], quote, ready, body };
}
