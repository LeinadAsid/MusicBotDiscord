import { ApplyOptions } from '@sapphire/decorators';
import { Args, Command } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { type Message, EmbedBuilder, TextChannel } from 'discord.js';
import {
	AudioPlayer,
	AudioPlayerStatus,
	StreamType,
	VoiceConnectionStatus,
	createAudioResource,
	entersState,
	joinVoiceChannel
} from '@discordjs/voice';

import ytdl from 'ytdl-core';
import { ServerInfo, Song } from '../interfaces/music.type';
import { getCurrentServerConnection } from '../lib/utils';

@ApplyOptions<Command.Options>({
	description: 'Music Commands to add, remove and manage songs on queue.'
})
export class UserCommand extends Subcommand {
	serversInfo: ServerInfo[] = [];
	timeouts: Record<string, NodeJS.Timeout> = {};

	public constructor(context: Subcommand.Context, options: Subcommand.Options) {
		super(context, {
			...options,
			name: 'music',
			subcommands: [
				{
					name: 'play',
					messageRun: 'playMusic',
					default: true
				},

				{
					name: 'stop',
					messageRun: 'stopMusic'
				},

				{
					name: 'queue',
					messageRun: 'seeQueue'
				},

				{
					name: 'skip',
					messageRun: 'skipSong'
				},

				{
					name: 'purge',
					messageRun: 'deleteQueue',
				}
			]
		});

		this.container.client.on('sentMusicCommand', (guildId, channelId) => {
			const findIndex = this.serversInfo.findIndex((server) => server.serverId === guildId);

			if (findIndex !== -1) {
				this.serversInfo[findIndex].lastChannelId = channelId as string;
			}
		});
	}

	public async playMusic(message: Message, args: Args) {
		const server = getCurrentServerConnection(this.serversInfo, message);

		let serverIndex = this.serversInfo.findIndex((servers) => servers.serverId === server.serverId);

		if (!this.serversInfo[serverIndex].eventsRegistered) {
			//If the server doesn't have eventsRegistered, do it.
			this.registerEvents(server, serverIndex);
		}

		try {
			if ((!server.connection || server.connection.state.status === VoiceConnectionStatus.Disconnected) && message) {
				server.connection = await this.connect(message);

				if (!server.connection) {
					throw `Couldn't connect to voice channel.`;
				}

				server.connection.subscribe(server.player);
			}

			let song: Song | null = null;

			if ((await args?.peekResult('url'))?.isOk()) {
				const videoUrl = await args!.pick('url');

				const videoInfo = await ytdl.getInfo(videoUrl.toString());

				song = {
					url: videoUrl.toString(),
					name: videoInfo.videoDetails.title
				};

				if (!song.url.includes('youtube') && !song.url.includes('youtu.be')) {
					message!.reply('Invalid link, try using a youtube video');
					return;
				}

				this.addToQueue(serverIndex, song);
			} else {
				song = server.queue[server.currentSongIndex];
			}


			this.playNextSong(serverIndex);
		} catch (e) {
			console.log(e);
			throw e;
		}
	}

	public async deleteQueue(message: Message) {
		const serverIndex = this.serversInfo.findIndex((server) => server.serverId === message.guildId);
		 
		if (serverIndex === -1) {
			return;
		}

		this.serversInfo[serverIndex].queue = [];

		return message.reply('Queue was purged.');
	}

	public async skipSong(message: Message) {
		const serverIndex = this.serversInfo.findIndex((server) => server.serverId === message.guildId);

		if (serverIndex === -1) {
			return;
		}

		await this.stop(serverIndex);
		this.serversInfo[serverIndex].currentSongIndex++;
		await this.playNextSong(serverIndex);
	}

	public async stopMusic(message?: Message) {
		const server = getCurrentServerConnection(this.serversInfo, message);
		let serverIndex = this.serversInfo.findIndex((servers) => servers.serverId === server.serverId);
		this.stop(serverIndex);
	}

	public async seeQueue(message: Message, _args: Args) {
		const serverId = message.guildId;

		const serverIndex = this.serversInfo.findIndex((server: ServerInfo) => server.serverId === serverId);

		if (serverIndex === -1) {
			return message.reply('No queue was found in this server!');
		}

		if (this.serversInfo[serverIndex].queue.length === 0) {
			return message.reply('Queue is empty.');
		}

		const embed = new EmbedBuilder().setTitle('Current Songs Queued').setColor('Red');

		
		this.serversInfo[serverIndex].queue.forEach((song: Song) => {
			embed.addFields({ name: song.name ?? 'noname', value: song.url });
		});

		return await message.channel.send({ embeds: [embed] });
	}

	private async playAudioResource(player: AudioPlayer, url: string) {
		const audio = ytdl(url.toString(), { filter: 'audioonly', dlChunkSize: 4096, highWaterMark: 1 << 30, liveBuffer: 20000 });

		const resource = createAudioResource(audio, {
			inputType: StreamType.Arbitrary,
			inlineVolume: true
		});

		player.play(resource);
	}

	private async addToQueue(serverIndex: number, song: Song) {
		this.serversInfo[serverIndex].queue.push(song);
	}

	private async connect(message: Message) {
		const userChannel = message.member?.voice.channel;

		if (!userChannel) return;

		const connection = joinVoiceChannel({
			channelId: userChannel.id,
			guildId: userChannel.guild.id,
			adapterCreator: userChannel.guild.voiceAdapterCreator
		});

		try {
			await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

			return connection;
		} catch (e) {
			connection.destroy();
			throw e;
		}
	}

	private async playNextSong(serverIndex: number) {
		const server = this.serversInfo[serverIndex];

		if (server.player.state.status !== AudioPlayerStatus.Playing) {
			await this.playAudioResource(server.player, server.queue[server.currentSongIndex].url);
			return entersState(server.player, AudioPlayerStatus.Playing, 5000);
		} else {
			return;
		}
	}
	
	private async stop(serverIndex: number) {
		let server = this.serversInfo[serverIndex];
		try {
			entersState(server.player, AudioPlayerStatus.Paused, 5000);
			//this.currentSongIndex++;
			return server.player.pause();
		} catch (e) {
			throw e;
		}
	}

	private registerEvents(server: ServerInfo, index: number) {
		server.eventsRegistered = true;

		server.player.on('stateChange', (oldState, newState) => {
			if (newState.status === AudioPlayerStatus.Idle) {
				this.timeouts[server.serverId ?? ''] = setTimeout(() => {
					server.connection?.disconnect();
					const channel = this.container.client.channels.cache.get(server.lastChannelId ?? '') as TextChannel;
					channel?.send('Disconnected due to inactivity 😴😴');
				}, 30_000);
			}

			if (newState.status === AudioPlayerStatus.Playing) {
				clearTimeout(this.timeouts[server.serverId ?? '']);
			}

			if (oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Idle) {
				server.currentSongIndex += 1;

				if (server.currentSongIndex > server.queue.length - 1) {
					server.currentSongIndex = 0;
					return;
				}

				this.playNextSong(index);
			}
		});
	}
}
