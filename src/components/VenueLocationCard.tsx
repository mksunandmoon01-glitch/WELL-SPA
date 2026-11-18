import React, { useEffect, useMemo, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  ExternalLink,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Send,
} from 'lucide-react';
import { VENUE_DEFAULTS } from '../lib/seedStudio';
import type { Studio } from '../types/spa';

interface VenueLocationCardProps {
  studio?: Partial<Studio> | null;
  compact?: boolean;
  showMap?: boolean;
}

interface ResolvedPlace {
  placeId?: string;
  displayName: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  googleMapsUri?: string;
}

interface ServerPlaceResponse {
  place?: {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    googleMapsUri?: string;
    googleMapsLinks?: { directionsUri?: string; placeUri?: string };
  } | null;
  error?: string;
  quotaExceeded?: boolean;
}

function isQuotaErrorMessage(value: unknown): boolean {
  const msg = String(value ?? '').toUpperCase();
  return (
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('QUOTA') ||
    msg.includes('429')
  );
}

function parseTelegramHandles(raw: string): Array<{ label: string; href: string }> {
  return raw
    .split(/[&,/\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.startsWith('@') && part.length > 1)
    .map((handle) => ({
      label: handle,
      href: `https://t.me/${handle.slice(1)}`,
    }));
}

function parsePhoneNumbers(raw: string): string[] {
  const matches = raw.match(/\+?\d[\d\s()-]{6,}\d/g);
  if (matches && matches.length > 0) {
    return matches.map((m) => m.trim());
  }
  return raw ? [raw.trim()] : [];
}

function normalizeTelegramChannel(raw: string): { label: string; href: string } {
  const cleaned = raw.trim().replace(/^https?:\/\//i, '');
  if (!cleaned) {
    return { label: 't.me/sunmoon_24', href: 'https://t.me/sunmoon_24' };
  }
  if (cleaned.startsWith('@')) {
    return { label: `t.me/${cleaned.slice(1)}`, href: `https://t.me/${cleaned.slice(1)}` };
  }
  return { label: cleaned, href: `https://${cleaned}` };
}

function VenueMapCanvas({
  venueName,
  address,
}: {
  venueName: string;
  address: string;
}) {
  const placesLib = useMapsLibrary('places');
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [resolvedPlace, setResolvedPlace] = useState<ResolvedPlace | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState('');
  const [infoOpen, setInfoOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const searchViaServerProxy = async (query: string): Promise<ResolvedPlace | null> => {
      const res = await fetch('/api/public/venue-place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textQuery: query }),
      });
      const payload = (await res.json().catch(() => ({}))) as ServerPlaceResponse;

      if (
        res.status === 429 ||
        payload.quotaExceeded ||
        payload.error === 'RESOURCE_EXHAUSTED'
      ) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        throw new Error('QUOTA_EXCEEDED');
      }

      if (!res.ok) {
        return null;
      }

      const p = payload.place;
      const lat = p?.location?.latitude;
      const lng = p?.location?.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return null;
      }

      return {
        placeId: p?.id,
        displayName: p?.displayName?.text || venueName,
        formattedAddress: p?.formattedAddress || address,
        location: { lat, lng },
        googleMapsUri:
          p?.googleMapsLinks?.directionsUri ||
          p?.googleMapsLinks?.placeUri ||
          p?.googleMapsUri,
      };
    };

    const resolveVenuePlace = async () => {
      setMapLoading(true);
      setMapError('');

      const queries = [`${venueName}, Phnom Penh`, `${venueName}, ${address}`];

      try {
        if (placesLib && typeof placesLib.Place?.searchByText === 'function') {
          for (const textQuery of queries) {
            try {
              const { places } = await placesLib.Place.searchByText({
                textQuery,
                fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsUri'],
                region: 'KH',
              });
              const first = places?.[0];
              if (first?.location) {
                const rawLat = first.location.lat as number | (() => number);
                const rawLng = first.location.lng as number | (() => number);
                const lat = typeof rawLat === 'function' ? rawLat.call(first.location) : Number(rawLat);
                const lng = typeof rawLng === 'function' ? rawLng.call(first.location) : Number(rawLng);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                  if (!cancelled) {
                    setResolvedPlace({
                      placeId: first.id,
                      displayName: first.displayName || venueName,
                      formattedAddress: first.formattedAddress || address,
                      location: { lat, lng },
                      googleMapsUri: first.googleMapsUri ?? undefined,
                    });
                    setMapLoading(false);
                  }
                  return;
                }
              }
            } catch (sdkErr) {
              if (isQuotaErrorMessage(sdkErr)) {
                window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
                if (!cancelled) {
                  setMapError('Unable to load venue map right now.');
                  setMapLoading(false);
                }
                return;
              }
            }
          }
        }

        for (const textQuery of queries) {
          const proxyPlace = await searchViaServerProxy(textQuery);
          if (proxyPlace) {
            if (!cancelled) {
              setResolvedPlace(proxyPlace);
              setMapLoading(false);
            }
            return;
          }
        }

        if (!cancelled) {
          setMapError('Interactive map pin is temporarily unavailable for this address.');
          setMapLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          if (String(err) === 'Error: QUOTA_EXHAUSTED' || isQuotaErrorMessage(err)) {
            setMapError('Google Maps Platform quota limit reached.');
          } else {
            setMapError('Unable to load interactive venue map.');
          }
          setMapLoading(false);
        }
      }
    };

    void resolveVenuePlace();
    return () => {
      cancelled = true;
    };
  }, [placesLib, venueName, address]);

  return (
    <div className="flex flex-col gap-3">
      <div className="h-[300px] lg:h-[340px] w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative">
        {mapLoading ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-2">
            <MapPin className="w-6 h-6 text-teal-700 animate-pulse" />
            <p className="text-sm font-medium text-slate-700">Locating {venueName}...</p>
            <p className="text-xs text-slate-500 max-w-xs">{address}</p>
          </div>
        ) : resolvedPlace ? (
          <GoogleMap
            mapId="DEMO_MAP_ID"
            defaultCenter={resolvedPlace.location}
            defaultZoom={16}
            gestureHandling="cooperative"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
          >
            <AdvancedMarker
              ref={markerRef}
              position={resolvedPlace.location}
              title={resolvedPlace.displayName}
              onClick={() => setInfoOpen((prev) => !prev)}
            >
              <Pin
                background="#0f766e"
                borderColor="#115e59"
                glyphColor="#ffffff"
                scale={1.15}
              />
            </AdvancedMarker>
            {infoOpen && marker && (
              <InfoWindow
                anchor={marker}
                maxWidth={260}
                onCloseClick={() => setInfoOpen(false)}
              >
                <div className="p-0.5 space-y-1 text-slate-900">
                  <p className="text-xs font-bold leading-snug">{resolvedPlace.displayName}</p>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    {resolvedPlace.formattedAddress}
                  </p>
                  {resolvedPlace.googleMapsUri && (
                    <a
                      href={resolvedPlace.googleMapsUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline pt-0.5"
                    >
                      <span>Directions in Google Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-2 bg-slate-50">
            <MapPin className="w-6 h-6 text-slate-400" />
            <p className="text-sm font-semibold text-slate-800">{venueName}</p>
            <p className="text-xs text-slate-500 max-w-sm">{mapError || address}</p>
          </div>
        )}
      </div>

      {resolvedPlace?.googleMapsUri && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-0.5">
          <span className="truncate">{resolvedPlace.formattedAddress}</span>
          <a
            href={resolvedPlace.googleMapsUri}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-teal-700 hover:text-teal-800 shrink-0"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Open in Google Maps</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}

export function VenueLocationCard({
  studio,
  compact = false,
  showMap = true,
}: VenueLocationCardProps) {
  const venueName = studio?.venueName?.trim() || VENUE_DEFAULTS.venueName;
  const address = studio?.address?.trim() || VENUE_DEFAULTS.address;
  const rawPhone = studio?.phone?.trim() || VENUE_DEFAULTS.phone;
  const contactEmail = studio?.contactEmail?.trim() || VENUE_DEFAULTS.contactEmail;
  const rawTelegramContacts =
    studio?.telegramContacts?.trim() || VENUE_DEFAULTS.telegramContacts;
  const rawTelegramChannel =
    studio?.telegramChannel?.trim() || VENUE_DEFAULTS.telegramChannel;

  const phoneNumbers = useMemo(() => parsePhoneNumbers(rawPhone), [rawPhone]);
  const telegramHandles = useMemo(
    () => parseTelegramHandles(rawTelegramContacts),
    [rawTelegramContacts],
  );
  const telegramChannel = useMemo(
    () => normalizeTelegramChannel(rawTelegramChannel),
    [rawTelegramChannel],
  );

  const envApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';
  const [apiKey, setApiKey] = useState(envApiKey);
  const [configLoaded, setConfigLoaded] = useState(Boolean(envApiKey));

  useEffect(() => {
    if (!showMap) return;
    if (envApiKey) {
      setApiKey(envApiKey);
      setConfigLoaded(true);
      return;
    }

    let cancelled = false;
    fetch('/api/public/maps-config')
      .then((res) => (res.ok ? res.json() : { apiKey: '' }))
      .then((data: { apiKey?: string }) => {
        if (!cancelled) {
          setApiKey(data.apiKey || '');
          setConfigLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConfigLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [envApiKey, showMap]);

  return (
    <section
      id="venue-location"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-teal-700 tracking-wide">
            Location, Venue &amp; Concierge Contact
          </p>
          <h2 className="font-display text-lg font-bold text-slate-900 mt-0.5">
            {venueName}
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-500">Phnom Penh · Waterfront</span>
      </div>

      <div
        className={`${
          showMap ? 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-start' : ''
        } ${compact ? 'p-5' : 'p-6'}`}
      >
        <div className={showMap ? 'lg:col-span-5 space-y-4' : 'w-full'}>
          <div
            className={`p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm ${
              showMap
                ? 'space-y-3.5'
                : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            }`}
          >
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Venue &amp; Address
                </p>
                <p className="font-semibold text-slate-900">{venueName}</p>
                <p className="text-xs text-slate-600 leading-relaxed">{address}</p>
              </div>
            </div>

            <div
              className={`flex items-start gap-3 ${
                showMap ? 'pt-3 border-t border-slate-200' : ''
              }`}
            >
              <Phone className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Phone Number
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {phoneNumbers.map((num) => (
                    <a
                      key={num}
                      href={`tel:${num.replace(/\s+/g, '')}`}
                      className="font-mono text-xs font-semibold text-slate-900 hover:text-teal-700 tabular-nums"
                    >
                      {num}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div
              className={`flex items-start gap-3 ${
                showMap ? 'pt-3 border-t border-slate-200' : ''
              }`}
            >
              <Mail className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Email
                </p>
                <a
                  href={`mailto:${contactEmail}`}
                  className="text-xs font-medium text-teal-800 hover:underline break-all"
                >
                  {contactEmail}
                </a>
              </div>
            </div>

            <div
              className={`flex items-start gap-3 ${
                showMap ? 'pt-3 border-t border-slate-200' : ''
              }`}
            >
              <MessageCircle className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Contact Person Telegram
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {telegramHandles.length > 0 ? (
                    telegramHandles.map((handle, index) => (
                      <React.Fragment key={handle.label}>
                        {index > 0 && <span className="text-slate-400">&amp;</span>}
                        <a
                          href={handle.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono font-semibold text-teal-800 hover:underline"
                        >
                          {handle.label}
                        </a>
                      </React.Fragment>
                    ))
                  ) : (
                    <span className="font-mono text-slate-800">{rawTelegramContacts}</span>
                  )}
                </div>
              </div>
            </div>

            <div
              className={`flex items-start gap-3 ${
                showMap ? 'pt-3 border-t border-slate-200' : ''
              }`}
            >
              <Send className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Telegram Channel
                </p>
                <a
                  href={telegramChannel.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-teal-800 hover:underline"
                >
                  <span>{telegramChannel.label}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {showMap && (
          <div className="lg:col-span-7">
          {!configLoaded ? (
            <div className="h-[300px] lg:h-[340px] w-full rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-500">
              Loading Google Maps configuration...
            </div>
          ) : apiKey ? (
            <APIProvider apiKey={apiKey} libraries={['places', 'marker']} language="en" region="KH">
              <VenueMapCanvas venueName={venueName} address={address} />
            </APIProvider>
          ) : (
            <div className="h-[300px] lg:h-[340px] w-full rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-6 text-center gap-2">
              <MapPin className="w-6 h-6 text-teal-700" />
              <p className="text-sm font-semibold text-slate-900">{venueName}</p>
              <p className="text-xs text-slate-600 max-w-md">{address}</p>
              <p className="text-[11px] text-slate-500 pt-1">
                Interactive map displays automatically once the Google Maps API key is active in the environment.
              </p>
            </div>
          )}
          </div>
        )}
      </div>
    </section>
  );
}
