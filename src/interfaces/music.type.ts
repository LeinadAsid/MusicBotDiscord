import { AudioPlayer, VoiceConnection } from "@discordjs/voice"

export type Song = {
    url: string,
    name?: string,
}

export type ServerInfo = {
    serverId: string | null | undefined,
    lastChannelId: string | null,
    player: AudioPlayer,
    queue: Song[],
    currentSongIndex: number,
    connection: VoiceConnection | undefined,
}