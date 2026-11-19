import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  AdvancedMarker,
  APILoadingStatus,
  APIProvider,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  Hospital,
  MapPin,
  Navigation,
  Pill,
  ShieldAlert,
  Stethoscope,
  Volume2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {DEMO_COORDS, useFirebase} from '../contexts/FirebaseContext';
import {PatientProfile} from '../types';
import {speakText, stopSpeech, triggerVibration} from '../utils/multimodal';

interface SafetyMapModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  patientProfile: PatientProfile;
}

interface LatLngLiteral {
  lat: number;
  lng: number;
}

interface PolylineHandle {
  setOptions: (opts: {strokeColor?: string; strokeWeight?: number}) => void;
  setMap: (map: unknown) => void;
}

interface PlaceSearchResult {
  id?: string;
  displayName?: string;
  formattedAddress?: string;
  rating?: number | null;
  googleMapsURI?: string | null;
  location?: {
    lat: () => number;
    lng: () => number;
  };
}

interface FacilityItem {
  id: string;
  name: string;
  address: string;
  location: LatLngLiteral;
  rating?: number | null;
  googleMapsURI?: string | null;
  category: 'hospital' | 'pharmacy' | 'doctor';
}

const DEMO_CENTER: LatLngLiteral = {lat: 37.7793, lng: -122.4193}; // San Francisco Civic Center

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('Quota') ||
    msg.includes('429')
  );
}

interface FacilityMarkerProps {
  facility: FacilityItem;
  isSelected: boolean;
  onSelect: (item: FacilityItem) => void;
  onRoute: (item: FacilityItem) => void;
}

const FacilityMarker: React.FC<FacilityMarkerProps> = ({
  facility,
  isSelected,
  onSelect,
  onRoute,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const pinColors =
    facility.category === 'hospital'
      ? {bg: '#dc2626', border: '#991b1b', glyph: '#ffffff'}
      : facility.category === 'pharmacy'
        ? {bg: '#16a34a', border: '#166534', glyph: '#ffffff'}
        : {bg: '#2563eb', border: '#1e40af', glyph: '#ffffff'};

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={facility.location}
        title={facility.name}
        onClick={() => onSelect(facility)}
      >
        <Pin
          background={pinColors.bg}
          borderColor={pinColors.border}
          glyphColor={pinColors.glyph}
          scale={isSelected ? 1.25 : 1.0}
        />
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => onSelect(facility)} maxWidth={260}>
          <div className="text-slate-900 space-y-2 p-1">
            <p className="font-bold text-sm leading-snug">{facility.name}</p>
            {facility.address && <p className="text-xs text-slate-600">{facility.address}</p>}
            {facility.rating != null && (
              <p className="text-xs font-semibold">Rating: {facility.rating.toFixed(1)} / 5</p>
            )}
            <button
              type="button"
              onClick={() => onRoute(facility)}
              className="w-full py-2 px-3 rounded-lg bg-sky-600 text-white text-xs font-bold cursor-pointer"
            >
              Show Route on Map
            </button>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface MapWorkspaceProps {
  voiceSpeed: number;
  patientProfile: PatientProfile;
}

const MapWorkspace: React.FC<MapWorkspaceProps> = ({voiceSpeed, patientProfile}) => {
  const {liveLocation, setLiveLocationState, publishRemoteTelemetry} = useFirebase();
  const map = useMap();
  const loadingStatus = useApiLoadingStatus();
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');

  const [center, setCenter] = useState<LatLngLiteral>({
    lat: liveLocation.lat,
    lng: liveLocation.lng,
  });
  const [gpsConsentGranted, setGpsConsentGranted] = useState(liveLocation.gpsConsentActive);
  const [locationLabel, setLocationLabel] = useState(
    liveLocation.gpsConsentActive
      ? `Live Device GPS (${liveLocation.lat.toFixed(4)}, ${liveLocation.lng.toFixed(4)})`
      : 'Exhibition Demo Location (San Francisco)'
  );
  const [activeCategory, setActiveCategory] = useState<'hospital' | 'pharmacy' | 'doctor'>('hospital');
  const [facilities, setFacilities] = useState<FacilityItem[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<FacilityItem | null>(null);
  const [travelMode, setTravelMode] = useState<'DRIVING' | 'WALKING' | 'TRANSIT'>('DRIVING');
  const [routeSummary, setRouteSummary] = useState<{
    destinationName: string;
    distanceText: string;
    durationText: string;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [routing, setRouting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const polylinesRef = useRef<PolylineHandle[]>([]);

  const clearRoutePolylines = useCallback(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearRoutePolylines();
  }, [clearRoutePolylines]);

  useEffect(() => {
    if (
      loadingStatus === APILoadingStatus.AUTH_FAILURE ||
      loadingStatus === APILoadingStatus.FAILED
    ) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [loadingStatus]);

  const requestLiveLocation = () => {
    setStatusError(null);
    if (!navigator.geolocation) {
      setStatusError('Geolocation is unavailable in this browser. Using Demo Location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {lat: pos.coords.latitude, lng: pos.coords.longitude};
        setCenter(next);
        setGpsConsentGranted(true);
        setLocationLabel(
          `Live Device GPS (${next.lat.toFixed(4)}, ${next.lng.toFixed(4)})`
        );
        setLiveLocationState(next, true);
        publishRemoteTelemetry(patientProfile, 'monitoring', {
          lat: next.lat,
          lng: next.lng,
          gpsConsentActive: true,
          updatedAtIso: new Date().toISOString(),
        }).catch(() => {});
        map?.panTo(next);
        map?.setZoom(14);
        triggerVibration(50);
        speakText('Live GPS location centered and shared to caregiver link.', voiceSpeed);
      },
      () => {
        setStatusError(
          'Location permission declined or unavailable. Keeping Exhibition Demo location.'
        );
      },
      {enableHighAccuracy: true, timeout: 8000}
    );
  };

  const revokeLiveLocation = () => {
    setGpsConsentGranted(false);
    setCenter(DEMO_COORDS);
    setLocationLabel('Exhibition Demo Location (San Francisco)');
    setLiveLocationState(DEMO_COORDS, false);
    publishRemoteTelemetry(patientProfile, 'monitoring', {
      lat: DEMO_COORDS.lat,
      lng: DEMO_COORDS.lng,
      gpsConsentActive: false,
      updatedAtIso: new Date().toISOString(),
    }).catch(() => {});
    clearRoutePolylines();
    setRouteSummary(null);
    map?.panTo(DEMO_COORDS);
    map?.setZoom(13);
  };

  const searchNearbyCare = useCallback(
    async (category: 'hospital' | 'pharmacy' | 'doctor') => {
      setActiveCategory(category);
      setStatusError(null);
      setSelectedFacility(null);
      if (!placesLib) {
        setStatusError('Places library is still initializing. Please try again in a moment.');
        return;
      }

      setSearching(true);
      try {
        const placeClass = placesLib.Place as unknown as {
          searchNearby: (req: unknown) => Promise<{places?: PlaceSearchResult[]}>;
        };
        const {places} = await placeClass.searchNearby({
          fields: ['id', 'displayName', 'location', 'formattedAddress', 'rating', 'googleMapsURI'],
          locationRestriction: {
            center,
            radius: 4500,
          },
          includedPrimaryTypes: [category],
          maxResultCount: 8,
        });

        const parsed: FacilityItem[] = (places || [])
          .filter((p) => p.location)
          .map((p) => ({
            id: p.id || `${p.displayName || 'place'}-${Math.random()}`,
            name: p.displayName || 'Accessible Care Facility',
            address: p.formattedAddress || '',
            location: {
              lat: p.location!.lat(),
              lng: p.location!.lng(),
            },
            rating: p.rating ?? null,
            googleMapsURI: p.googleMapsURI ?? null,
            category,
          }));

        setFacilities(parsed);
        if (parsed.length === 0) {
          setStatusError(`No ${category} locations found within 4.5 km of this point.`);
        } else {
          speakText(
            `Found ${parsed.length} nearby ${category} locations. Closest is ${parsed[0].name}.`,
            voiceSpeed
          );
        }
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setStatusError(
          err instanceof Error ? err.message : 'Unable to search nearby facilities.'
        );
      } finally {
        setSearching(false);
      }
    },
    [center, placesLib, voiceSpeed]
  );

  const computeRouteTo = useCallback(
    async (target: FacilityItem) => {
      setSelectedFacility(target);
      setStatusError(null);
      if (!routesLib || !map) {
        setStatusError('Routes library or map is still loading.');
        return;
      }

      clearRoutePolylines();
      setRouting(true);

      try {
        const request = {
          origin: center,
          destination: target.location,
          travelMode,
          fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
        };

        const {routes} = await (
          routesLib.Route as unknown as {
            computeRoutes: (req: unknown) => Promise<{
              routes?: Array<{
                createPolylines: () => PolylineHandle[];
                viewport?: unknown;
                distanceMeters?: number;
                durationMillis?: number;
              }>;
            }>;
          }
        ).computeRoutes(request);

        const primaryRoute = routes?.[0];
        if (!primaryRoute) {
          setStatusError('No route found to this facility.');
          return;
        }

        const newPolylines = primaryRoute.createPolylines();
        newPolylines.forEach((polyline) => {
          polyline.setOptions({
            strokeColor: '#0ea5e9',
            strokeWeight: 6,
          });
          polyline.setMap(map);
        });
        polylinesRef.current = newPolylines;

        if (primaryRoute.viewport) {
          (map as unknown as {fitBounds: (b: unknown) => void}).fitBounds(
            primaryRoute.viewport
          );
        }

        const km = ((primaryRoute.distanceMeters ?? 0) / 1000).toFixed(2);
        const mins = Math.max(1, Math.round((primaryRoute.durationMillis ?? 0) / 60000));
        setRouteSummary({
          destinationName: target.name,
          distanceText: `${km} km`,
          durationText: `${mins} min (${travelMode.toLowerCase()})`,
        });
        triggerVibration(60);
        speakText(
          `Route to ${target.name} ready: ${km} kilometers, about ${mins} minutes by ${travelMode.toLowerCase()}.`,
          voiceSpeed
        );
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setStatusError(
          err instanceof Error ? err.message : 'Unable to compute route right now.'
        );
      } finally {
        setRouting(false);
      }
    },
    [center, clearRoutePolylines, map, routesLib, travelMode, voiceSpeed]
  );

  return (
    <div className="space-y-5">
      {/* Consent & Informational Disclaimer */}
      <div className="surface-card rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5" aria-hidden="true" />
            <p className="font-display text-base sm:text-lg font-bold">{locationLabel}</p>
          </div>
          <p className="text-xs text-muted">
            Informational wayfinding only — in an urgent medical emergency, dial local emergency
            services (911 / 112) directly. Patient contact: {patientProfile.caregiverName} (
            {patientProfile.caregiverPhone})
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {!gpsConsentGranted ? (
            <button
              type="button"
              onClick={requestLiveLocation}
              className="btn-accent min-h-[56px] px-4 rounded-xl font-extrabold flex items-center gap-2 cursor-pointer"
            >
              <Compass className="w-5 h-5" aria-hidden="true" />
              <span>Share Live GPS</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={revokeLiveLocation}
              className="surface-elevated min-h-[56px] px-4 rounded-xl font-bold flex items-center gap-2 cursor-pointer"
            >
              <Compass className="w-5 h-5" aria-hidden="true" />
              <span>Stop GPS (Demo Center)</span>
            </button>
          )}
        </div>
      </div>

      {/* Category & Travel Mode Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => searchNearbyCare('hospital')}
              disabled={searching}
              className={`min-h-[56px] px-4 rounded-xl font-bold flex items-center gap-2 cursor-pointer ${
                activeCategory === 'hospital' && facilities.length > 0
                  ? 'btn-accent'
                  : 'surface-elevated'
              }`}
            >
              <Hospital className="w-5 h-5" aria-hidden="true" />
              <span>Find Hospitals</span>
            </button>
            <button
              type="button"
              onClick={() => searchNearbyCare('pharmacy')}
              disabled={searching}
              className={`min-h-[56px] px-4 rounded-xl font-bold flex items-center gap-2 cursor-pointer ${
                activeCategory === 'pharmacy' && facilities.length > 0
                  ? 'btn-accent'
                  : 'surface-elevated'
              }`}
            >
              <Pill className="w-5 h-5" aria-hidden="true" />
              <span>Find Pharmacies</span>
            </button>
            <button
              type="button"
              onClick={() => searchNearbyCare('doctor')}
              disabled={searching}
              className={`min-h-[56px] px-4 rounded-xl font-bold flex items-center gap-2 cursor-pointer ${
                activeCategory === 'doctor' && facilities.length > 0
                  ? 'btn-accent'
                  : 'surface-elevated'
              }`}
            >
              <Stethoscope className="w-5 h-5" aria-hidden="true" />
              <span>Find Clinics</span>
            </button>

            <div className="flex gap-1.5 ml-auto">
              {(['DRIVING', 'WALKING', 'TRANSIT'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTravelMode(mode)}
                  className={`min-h-[56px] px-3 rounded-xl text-xs font-extrabold cursor-pointer ${
                    travelMode === mode ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {statusError && (
            <p role="alert" className="text-sm font-bold text-[#ff5500]">
              {statusError}
            </p>
          )}

          {/* Explicit non-zero container height (CF2) */}
          <div className="w-full h-[380px] sm:h-[460px] rounded-2xl overflow-hidden border-2 border-theme">
            <GoogleMap
              defaultCenter={DEMO_CENTER}
              defaultZoom={13}
              mapId="DEMO_MAP_ID"
              gestureHandling="greedy"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{width: '100%', height: '100%'}}
            >
              <AdvancedMarker position={center} title={locationLabel}>
                <Pin
                  background="#0ea5e9"
                  borderColor="#0369a1"
                  glyphColor="#ffffff"
                  scale={1.2}
                />
              </AdvancedMarker>

              {facilities.map((facility) => (
                <FacilityMarker
                  key={facility.id}
                  facility={facility}
                  isSelected={selectedFacility?.id === facility.id}
                  onSelect={(item) =>
                    setSelectedFacility((cur) => (cur?.id === item.id ? null : item))
                  }
                  onRoute={computeRouteTo}
                />
              ))}
            </GoogleMap>
          </div>

          {routeSummary && (
            <div className="surface-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-muted uppercase">Active Care Route</p>
                <p className="font-display text-lg font-extrabold">
                  {routeSummary.destinationName}
                </p>
                <p className="text-sm font-bold">
                  {routeSummary.distanceText} · {routeSummary.durationText}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  speakText(
                    `Route to ${routeSummary.destinationName}: ${routeSummary.distanceText}, ${routeSummary.durationText}.`,
                    voiceSpeed
                  )
                }
                className="btn-accent min-h-[52px] px-4 rounded-xl font-bold flex items-center gap-2 cursor-pointer"
              >
                <Volume2 className="w-5 h-5" aria-hidden="true" />
                <span>Speak ETA</span>
              </button>
            </div>
          )}
        </div>

        {/* Nearby Facilities List */}
        <div className="lg:col-span-4 surface-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold">Nearby Facilities</h2>
            <span className="font-mono-nums text-xs font-bold text-muted">
              {searching ? 'Searching...' : `${facilities.length} found`}
            </span>
          </div>

          {facilities.length === 0 ? (
            <div className="surface-elevated rounded-xl p-4 text-sm text-muted space-y-2">
              <p className="font-bold">Tap a category above to search nearby care.</p>
              <p>
                Results come live from Google Maps Places API (New) and include distance-aware
                routing with voice ETA guidance.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[430px] overflow-y-auto pr-1">
              {facilities.map((item) => (
                <div key={item.id} className="surface-elevated rounded-xl p-4 space-y-2.5">
                  <div>
                    <p className="font-bold text-base leading-snug">{item.name}</p>
                    {item.address && <p className="text-xs text-muted mt-0.5">{item.address}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={routing}
                      onClick={() => computeRouteTo(item)}
                      className="btn-accent flex-1 min-h-[48px] px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Navigation className="w-4 h-4" aria-hidden="true" />
                      <span>{routing && selectedFacility?.id === item.id ? 'Routing...' : 'Route'}</span>
                    </button>
                    {item.googleMapsURI && (
                      <a
                        href={item.googleMapsURI}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="surface-card min-h-[48px] px-3 rounded-xl text-xs font-bold flex items-center justify-center"
                      >
                        Maps Link
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const OFFLINE_CARE_DIRECTORY = [
  {
    id: 'off_er',
    name: 'Local Emergency Medical & Ambulance Dispatch',
    instructions: 'Dial 911 (US/Canada) or 112 (EU/International) from your phone dialer anytime.',
    category: 'Emergency',
  },
  {
    id: 'off_pharmacy',
    name: 'Medication Refill & Caregiver Check',
    instructions: 'Show your Allergies & Medical Notes on Caregiver Portal or tap Call Caregiver below.',
    category: 'Medication',
  },
  {
    id: 'off_safe_return',
    name: 'Safe Return Orientation Reminder',
    instructions: 'Wait in a lit public entrance or clinic reception while sharing your GPS coordinates below.',
    category: 'Safe Spot',
  },
];

const OfflineMapFallback: React.FC<{
  voiceSpeed: number;
  patientProfile: PatientProfile;
}> = ({voiceSpeed, patientProfile}) => {
  const {browserOnline, setManualOfflineMode, liveLocation, setLiveLocationState} = useFirebase();
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string | null>(null);

  const captureDeviceGps = () => {
    setGpsStatusMsg(null);
    if (!navigator.geolocation) {
      setGpsStatusMsg('Geolocation API unavailable on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {lat: pos.coords.latitude, lng: pos.coords.longitude};
        setLiveLocationState(coords, true);
        triggerVibration(50);
        speakText(
          `On-device GPS captured: latitude ${coords.lat.toFixed(3)}, longitude ${coords.lng.toFixed(3)}.`,
          voiceSpeed
        );
      },
      () => {
        setGpsStatusMsg('GPS permission denied or signal unavailable indoors.');
      },
      {enableHighAccuracy: true, timeout: 8000}
    );
  };

  return (
    <div className="space-y-5">
      <div className="surface-card rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-2 border-[#ff5500]/60">
        <div className="flex items-start gap-3">
          <WifiOff className="w-7 h-7 text-[#ff5500] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="font-display text-xl font-extrabold">
              Offline GPS &amp; Emergency Orientation Mode
            </h2>
            <p className="text-sm text-muted">
              Live Google Maps tiles and place search require internet access, but your device GPS
              coordinates and emergency caregiver contacts stay active offline.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={captureDeviceGps}
            className="btn-accent min-h-[54px] px-4 rounded-xl font-extrabold flex items-center gap-2 cursor-pointer"
          >
            <Compass className="w-5 h-5" aria-hidden="true" />
            <span>Read Device GPS</span>
          </button>
          {browserOnline && (
            <button
              type="button"
              onClick={() => setManualOfflineMode(false)}
              className="surface-elevated min-h-[54px] px-4 rounded-xl font-bold flex items-center gap-2 cursor-pointer"
            >
              <Wifi className="w-5 h-5" aria-hidden="true" />
              <span>Reconnect Map</span>
            </button>
          )}
        </div>
      </div>

      {gpsStatusMsg && (
        <p role="alert" className="text-sm font-bold text-[#ff5500]">
          {gpsStatusMsg}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 surface-card rounded-3xl p-6 space-y-4">
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
            Current Stored GPS Coordinates
          </p>
          <p className="font-mono-nums text-3xl font-extrabold">
            {liveLocation.lat.toFixed(5)}°, {liveLocation.lng.toFixed(5)}°
          </p>
          <p className="text-sm text-muted">
            Source: {liveLocation.gpsConsentActive ? 'Live Hardware GPS' : 'Exhibition Demo Center'} ·
            Primary Contact: <strong>{patientProfile.caregiverName}</strong> ({patientProfile.caregiverPhone})
          </p>
          <button
            type="button"
            onClick={() =>
              speakText(
                `Current coordinates are latitude ${liveLocation.lat.toFixed(3)}, longitude ${liveLocation.lng.toFixed(3)}. Primary caregiver is ${patientProfile.caregiverName}.`,
                voiceSpeed
              )
            }
            className="btn-accent min-h-[52px] px-5 rounded-xl font-extrabold inline-flex items-center gap-2 cursor-pointer"
          >
            <Volume2 className="w-5 h-5" aria-hidden="true" />
            <span>Read Coordinates Aloud</span>
          </button>
        </div>

        <div className="lg:col-span-6 surface-card rounded-3xl p-6 space-y-3">
          <h3 className="font-display text-lg font-extrabold">Offline Safe Wayfinding Cards</h3>
          <div className="space-y-2.5">
            {OFFLINE_CARE_DIRECTORY.map((item) => (
              <div key={item.id} className="surface-elevated rounded-2xl p-4 space-y-1">
                <p className="text-xs font-extrabold uppercase text-[#ff5500]">{item.category}</p>
                <p className="font-bold text-base">{item.name}</p>
                <p className="text-xs text-muted">{item.instructions}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const SafetyMapModule: React.FC<SafetyMapModuleProps> = ({
  onBack,
  voiceSpeed,
  patientProfile,
}) => {
  const {isOfflineMode} = useFirebase();
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        moduleId="map"
        title="Caregiver & Accessible Care Map"
        subtitle="12 · Live GPS Wayfinding & Nearby Medical Support"
        onBack={() => {
          stopSpeech();
          onBack();
        }}
      />

      {isOfflineMode ? (
        <OfflineMapFallback voiceSpeed={voiceSpeed} patientProfile={patientProfile} />
      ) : !apiKey ? (
        <div className="surface-card rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-[#ff5500]">
            <ShieldAlert className="w-6 h-6" aria-hidden="true" />
            <h2 className="font-display text-xl font-bold">Google Maps Key Not Loaded</h2>
          </div>
          <p className="text-sm text-muted">
            Google Maps API key (`VITE_GOOGLE_MAPS_API_KEY`) is not currently injected in this
            runtime environment. Refresh after provisioning or switch to Offline Mode to capture raw
            GPS coordinates.
          </p>
        </div>
      ) : (
        <APIProvider apiKey={apiKey} libraries={['places', 'routes', 'marker']}>
          <MapWorkspace voiceSpeed={voiceSpeed} patientProfile={patientProfile} />
        </APIProvider>
      )}
    </section>
  );
};
