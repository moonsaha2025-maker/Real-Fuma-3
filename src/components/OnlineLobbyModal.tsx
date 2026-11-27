import React, { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Globe,
  Loader2,
  Lock,
  LogOut,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { getCarSpec } from '../data/cars';
import { REGIONS } from '../data/world';
import { audioEngine } from '../engine/audio';
import { normalizeRoomCode } from '../services/onlineMultiplayer';
import type {
  OnlinePlayerState,
  OnlineRoom,
  OwnedCarData,
  PlayerSaveData,
  RegionId,
  TimeOfDay,
  WeatherType,
} from '../types/game';

interface OnlineLobbyModalProps {
  save: PlayerSaveData;
  activeCar: OwnedCarData;
  authUser: FirebaseUser | null;
  authBusy: boolean;
  publicRooms: OnlineRoom[];
  activeRoom: OnlineRoom | null;
  roomPlayers: OnlinePlayerState[];
  onlineBusy: boolean;
  onlineError: string | null;
  onGoogleSignIn: () => Promise<{ ok: boolean; error?: string }>;
  onCreateRoom: (params: {
    name: string;
    isPublic: boolean;
    regionId: RegionId;
    weather: WeatherType;
    timeOfDay: TimeOfDay;
  }) => Promise<void>;
  onJoinRoom: (roomId: string) => Promise<void>;
  onLeaveRoom: () => Promise<void>;
  onUpdateRoomMeta: (
    patch: Partial<Pick<OnlineRoom, 'weather' | 'timeOfDay' | 'regionId'>>,
  ) => Promise<void>;
  onLaunchOnlineDrive: () => void;
  onBack: () => void;
}

const WEATHERS: Array<{ id: WeatherType; label: string }> = [
  { id: 'sunny', label: 'Sunny' },
  { id: 'cloudy', label: 'Cloudy' },
  { id: 'rain', label: 'Rain' },
  { id: 'heavy_rain', label: 'Heavy Rain' },
  { id: 'thunderstorm', label: 'Storm' },
  { id: 'fog', label: 'Fog' },
];

const TIMES: Array<{ id: TimeOfDay; label: string }> = [
  { id: 'sunrise', label: 'Sunrise' },
  { id: 'day', label: 'Day' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'night', label: 'Night' },
];

const PlayerAvatar: React.FC<{
  photoURL: string;
  displayName: string;
  sizeClass?: string;
}> = ({ photoURL, displayName, sizeClass = 'w-9 h-9' }) => {
  const [failed, setFailed] = useState(false);
  const initial = (displayName.trim()[0] || 'G').toUpperCase();

  if (photoURL && !failed) {
    return (
      <img
        src={photoURL}
        alt={displayName}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${sizeClass} rounded-full object-cover border border-white/25 shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-emerald-900/70 border border-emerald-400/40 flex items-center justify-center font-display font-bold text-sm text-emerald-200 shrink-0`}
    >
      {initial}
    </div>
  );
};

export const OnlineLobbyModal: React.FC<OnlineLobbyModalProps> = ({
  save,
  activeCar,
  authUser,
  authBusy,
  publicRooms,
  activeRoom,
  roomPlayers,
  onlineBusy,
  onlineError,
  onGoogleSignIn,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onUpdateRoomMeta,
  onLaunchOnlineDrive,
  onBack,
}) => {
  const defaultHostName =
    authUser?.displayName?.split(' ')[0] || save.driverName || 'Driver';
  const [roomName, setRoomName] = useState(`${defaultHostName}'s Highway Cruise`);
  const [isPublic, setIsPublic] = useState(true);
  const [regionId, setRegionId] = useState<RegionId>('sunset_coast');
  const [weather, setWeather] = useState<WeatherType>('sunny');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('sunset');
  const [joinCode, setJoinCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const activeCarSpec = getCarSpec(activeCar.carId);
  const isHost = Boolean(
    authUser && activeRoom && activeRoom.hostUid === authUser.uid,
  );

  const handleCopyCode = async () => {
    if (!activeRoom) return;
    try {
      await navigator.clipboard.writeText(activeRoom.roomId);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Clipboard blocked in restricted frame
    }
  };

  return (
    <div className="fixed inset-0 z-30 bg-[#07080b]/95 overflow-y-auto p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                audioEngine.playUiClick();
                onBack();
              }}
              className="px-4 py-2 min-h-[40px] bg-white/10 hover:bg-white/20 text-white text-xs font-display font-bold tracking-wider uppercase flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div>
              <h1 className="font-display italic font-bold text-2xl sm:text-3xl tracking-wider text-white uppercase">
                Online Mode
              </h1>
              <p className="text-xs text-slate-400">
                Real-Time Multiplayer · Drivers Identified by Google Account
              </p>
            </div>
          </div>

          {authUser && (
            <div className="flex items-center gap-3 bg-[#10131c] border border-white/10 px-3.5 py-2">
              <PlayerAvatar
                photoURL={authUser.photoURL ?? ''}
                displayName={authUser.displayName ?? save.driverName}
              />
              <div className="min-w-0">
                <div className="font-display font-bold text-xs text-white truncate max-w-[180px]">
                  {authUser.displayName || authUser.email}
                </div>
                <div className="text-[11px] text-emerald-300 truncate max-w-[180px]">
                  @{save.driverName} · {activeCarSpec.name}
                </div>
              </div>
              <span
                className="w-3.5 h-3.5 border border-white/40 shrink-0"
                style={{ backgroundColor: activeCar.customization.paintColor }}
                title="Active car paint"
              />
            </div>
          )}
        </div>

        {onlineError && (
          <div
            role="alert"
            className="mb-5 bg-rose-950/70 border border-rose-500/50 text-rose-100 px-4 py-3 text-xs font-medium"
          >
            {onlineError}
          </div>
        )}

        {/* Gate 1: Require Google Account Authentication */}
        {!authUser ? (
          <div className="max-w-xl mx-auto bg-[#0f1119] border border-white/12 p-6 sm:p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-4 bg-emerald-500/15 border border-emerald-400/35 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <h2 className="font-display font-bold text-xl text-white tracking-wide uppercase mb-2">
              Google Account Required for Online Mode
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed mb-6">
              Sign in with your Google account so other players can recognize your
              Google profile name, avatar, and custom vehicle live on the highway
              and in multiplayer rooms.
            </p>
            <button
              type="button"
              disabled={authBusy}
              onClick={() => {
                audioEngine.playUiClick();
                void onGoogleSignIn();
              }}
              className="mx-auto px-6 py-3 min-h-[44px] bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-900 font-display font-bold text-sm tracking-wide flex items-center justify-center gap-2.5 cursor-pointer whitespace-nowrap"
            >
              {authBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
              )}
              <span>SIGN IN WITH GOOGLE</span>
            </button>
          </div>
        ) : activeRoom ? (
          /* Active Multiplayer Session Staging & Live Roster */
          <div className="space-y-6">
            <div className="bg-[#0f1119] border border-emerald-500/35 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-1.5">
                  <span className="font-display font-bold text-xs tracking-widest uppercase text-emerald-400">
                    {activeRoom.isPublic ? 'Public Session' : 'Invite Session'}
                  </span>
                  <span className="text-slate-500" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono-num text-xs text-slate-300 tabular-nums">
                    Code {activeRoom.roomId}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyCode()}
                    className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white text-[11px] font-display font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy Code
                      </>
                    )}
                  </button>
                </div>
                <h2 className="font-display font-bold text-2xl text-white tracking-wide">
                  {activeRoom.name}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Host: {activeRoom.hostDisplayName} ·{' '}
                  {REGIONS.find((r) => r.id === activeRoom.regionId)?.name ??
                    'Sunset Coast'}{' '}
                  · {activeRoom.weather.replace('_', ' ')} · {activeRoom.timeOfDay}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={onlineBusy}
                  onClick={() => {
                    audioEngine.playUiClick();
                    void onLeaveRoom();
                  }}
                  className="px-4 py-2.5 min-h-[42px] bg-white/10 hover:bg-rose-600/30 border border-white/15 text-slate-200 text-xs font-display font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <LogOut className="w-4 h-4" /> Leave Room
                </button>
                <button
                  type="button"
                  disabled={onlineBusy}
                  onClick={() => {
                    audioEngine.playUiClick();
                    onLaunchOnlineDrive();
                  }}
                  className="px-6 py-2.5 min-h-[42px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display italic font-bold text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer whitespace-nowrap shadow-lg"
                >
                  <Play className="w-4 h-4 fill-current" /> Drive Together
                </button>
              </div>
            </div>

            {isHost && (
              <div className="bg-[#0f1119] border border-white/10 p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-[11px] font-display uppercase tracking-wider text-slate-400 mb-2">
                    Spawn Region (Host)
                  </div>
                  <select
                    value={activeRoom.regionId}
                    onChange={(e) =>
                      void onUpdateRoomMeta({
                        regionId: e.target.value as RegionId,
                      })
                    }
                    className="w-full bg-[#161924] border border-white/15 px-3 py-2 text-xs text-white"
                  >
                    {REGIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-[11px] font-display uppercase tracking-wider text-slate-400 mb-2">
                    Room Weather (Host)
                  </div>
                  <select
                    value={activeRoom.weather}
                    onChange={(e) =>
                      void onUpdateRoomMeta({
                        weather: e.target.value as WeatherType,
                      })
                    }
                    className="w-full bg-[#161924] border border-white/15 px-3 py-2 text-xs text-white"
                  >
                    {WEATHERS.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-[11px] font-display uppercase tracking-wider text-slate-400 mb-2">
                    Time of Day (Host)
                  </div>
                  <select
                    value={activeRoom.timeOfDay}
                    onChange={(e) =>
                      void onUpdateRoomMeta({
                        timeOfDay: e.target.value as TimeOfDay,
                      })
                    }
                    className="w-full bg-[#161924] border border-white/15 px-3 py-2 text-xs text-white"
                  >
                    {TIMES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Connected Drivers List */}
            <div className="bg-[#0f1119] border border-white/10 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-sm uppercase tracking-wider text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span>
                    Drivers in Session ({roomPlayers.length}/{activeRoom.maxPlayers})
                  </span>
                </h3>
                <span className="text-xs text-slate-400">
                  Identified by Google Account
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {roomPlayers.map((player) => {
                  const pSpec = getCarSpec(player.carId);
                  const isYou = player.uid === authUser.uid;
                  const isRoomHost = player.uid === activeRoom.hostUid;
                  return (
                    <div
                      key={player.uid}
                      className={`p-3.5 border flex items-center justify-between gap-3 ${
                        isYou
                          ? 'bg-emerald-950/25 border-emerald-500/45'
                          : 'bg-[#141722] border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <PlayerAvatar
                          photoURL={player.googlePhotoURL}
                          displayName={player.googleDisplayName}
                          sizeClass="w-10 h-10"
                        />
                        <div className="min-w-0">
                          <div className="font-display font-bold text-sm text-white truncate">
                            {player.googleDisplayName}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            @{player.driverName}
                            {isYou ? ' · You' : ''}
                            {isRoomHost ? ' · Host' : ''}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="flex items-center justify-end gap-1.5 text-xs font-medium text-slate-200">
                          <span
                            className="w-2.5 h-2.5 border border-white/40 inline-block"
                            style={{ backgroundColor: player.paintColor }}
                          />
                          <span>{pSpec.name}</span>
                        </div>
                        <div className="font-mono-num text-[11px] text-emerald-300 tabular-nums mt-0.5">
                          {Math.round(player.speedKmh)} KMH
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Lobby Browser + Host Controls */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 cols: Join by Code + Public Sessions */}
            <div className="lg:col-span-7 space-y-5">
              <div className="bg-[#0f1119] border border-white/10 p-5">
                <label
                  htmlFor="online-room-code-input"
                  className="block text-xs font-display font-bold uppercase tracking-wider text-slate-300 mb-2.5"
                >
                  Join by Room Code
                </label>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const code = normalizeRoomCode(joinCode);
                    if (code.length >= 4) {
                      audioEngine.playUiClick();
                      void onJoinRoom(code);
                    }
                  }}
                  className="flex flex-col sm:flex-row gap-2.5"
                >
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="online-room-code-input"
                      type="text"
                      value={joinCode}
                      onChange={(e) =>
                        setJoinCode(normalizeRoomCode(e.target.value))
                      }
                      placeholder="Enter code (e.g. FM7K2P)"
                      maxLength={24}
                      className="w-full bg-[#161924] border border-white/15 pl-9 pr-3 py-2.5 text-sm font-mono-num uppercase tracking-widest text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={onlineBusy || joinCode.trim().length < 4}
                    className="px-5 py-2.5 min-h-[42px] bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Join Code
                  </button>
                </form>
              </div>

              <div className="bg-[#0f1119] border border-white/10 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display font-bold text-sm uppercase tracking-wider text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    <span>Live Public Sessions ({publicRooms.length})</span>
                  </h2>
                  <span className="text-xs text-slate-400">Auto-updating</span>
                </div>

                {publicRooms.length === 0 ? (
                  <div className="py-10 text-center border border-dashed border-white/10 px-4">
                    <p className="text-sm text-slate-300 font-medium">
                      No public sessions open right now
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Create a public session on the right and share your room code
                      with friends.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {publicRooms.map((room) => {
                      const regName =
                        REGIONS.find((r) => r.id === room.regionId)?.name ??
                        'Sunset Coast';
                      return (
                        <div
                          key={room.roomId}
                          className="p-3.5 bg-[#141722] border border-white/10 hover:border-emerald-400/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <PlayerAvatar
                              photoURL={room.hostPhotoURL}
                              displayName={room.hostDisplayName}
                              sizeClass="w-10 h-10"
                            />
                            <div className="min-w-0">
                              <div className="font-display font-bold text-sm text-white truncate">
                                {room.name}
                              </div>
                              <div className="text-xs text-slate-400 truncate">
                                Host: {room.hostDisplayName} · {regName} ·{' '}
                                {room.weather.replace('_', ' ')} ·{' '}
                                <span className="font-mono-num text-emerald-300">
                                  {room.roomId}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={onlineBusy}
                            onClick={() => {
                              audioEngine.playUiClick();
                              void onJoinRoom(room.roomId);
                            }}
                            className="px-4 py-2 min-h-[38px] bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Join Session
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right 5 cols: Create / Host New Online Session */}
            <div className="lg:col-span-5 bg-[#0f1119] border border-white/10 p-5 flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <h2 className="font-display font-bold text-sm uppercase tracking-wider text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span>Host Online Session</span>
                </h2>

                <div>
                  <label
                    htmlFor="online-room-name-input"
                    className="block text-xs text-slate-400 mb-1.5"
                  >
                    Session Name
                  </label>
                  <input
                    id="online-room-name-input"
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value.slice(0, 40))}
                    maxLength={40}
                    className="w-full bg-[#161924] border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <div className="text-xs text-slate-400 mb-1.5">Visibility</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPublic(true)}
                      className={`px-3 py-2 min-h-[40px] border text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        isPublic
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                          : 'bg-[#161924] border-white/10 text-slate-300'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" /> Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPublic(false)}
                      className={`px-3 py-2 min-h-[40px] border text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        !isPublic
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-[#161924] border-white/10 text-slate-300'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" /> Invite Only
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-400 mb-1.5">
                    Starting Region
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {REGIONS.map((reg) => (
                      <button
                        key={reg.id}
                        type="button"
                        onClick={() => setRegionId(reg.id)}
                        className={`px-3 py-2 text-left border text-xs font-display font-bold cursor-pointer truncate ${
                          regionId === reg.id
                            ? 'bg-white/15 border-white text-white'
                            : 'bg-[#161924] border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        {reg.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="online-host-weather"
                      className="block text-xs text-slate-400 mb-1.5"
                    >
                      Weather
                    </label>
                    <select
                      id="online-host-weather"
                      value={weather}
                      onChange={(e) =>
                        setWeather(e.target.value as WeatherType)
                      }
                      className="w-full bg-[#161924] border border-white/15 px-3 py-2 text-xs text-white"
                    >
                      {WEATHERS.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="online-host-time"
                      className="block text-xs text-slate-400 mb-1.5"
                    >
                      Time of Day
                    </label>
                    <select
                      id="online-host-time"
                      value={timeOfDay}
                      onChange={(e) =>
                        setTimeOfDay(e.target.value as TimeOfDay)
                      }
                      className="w-full bg-[#161924] border border-white/15 px-3 py-2 text-xs text-white"
                    >
                      {TIMES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={onlineBusy}
                onClick={() => {
                  audioEngine.playUiClick();
                  void onCreateRoom({
                    name: roomName,
                    isPublic,
                    regionId,
                    weather,
                    timeOfDay,
                  });
                }}
                className="w-full py-3 min-h-[46px] bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-display italic font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shadow-lg"
              >
                {onlineBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                <span>Create Online Room</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
