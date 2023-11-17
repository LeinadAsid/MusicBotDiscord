import { ApplyOptions } from '@sapphire/decorators';
import { Args, Command } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { type Message, EmbedBuilder } from 'discord.js';
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

@ApplyOptions<Command.Options>({
	description: 'Music Commands to add, remove and manage songs on queue.'
})
export class UserCommand extends Subcommand {
	
	serversInfo: ServerInfo[] = [];

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
					messageRun: 'skipSong',
				}
			]
		});

		this.serversInfo.forEach((server, index) => {
			server.player.on('stateChange', (oldState, newState) => {
				if (oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Idle) {
					server.currentSongIndex++;
	
					if (server.currentSongIndex > server.queue.length - 1) {
						server.currentSongIndex = 0;
						return;
					}
	
					this.playMusic(undefined, undefined, index);
				}
			})
		})
	}

	public async playMusic(message?: Message, args?: Args, serverIndex?: number) {

		const s_index = this.serversInfo.findIndex((server: ServerInfo) => server.serverId === message?.guildId);

		if (!serverIndex || s_index === -1) {
			this.serversInfo.push({
				serverId: message?.guildId,
				connection: undefined,
				player: new AudioPlayer(),
				queue: [],
				currentSongIndex: 0,
			});

			serverIndex = this.serversInfo.length - 1;
		}
		
		const server = this.serversInfo[serverIndex];

		try {
			if (!server.connection && message) {
				server.connection = await this.connect(message);

				if (!server.connection) {
					throw `Couldn't connect to voice channel.`;
				}
	
				server.connection.subscribe(server.player);
			}

			let song: Song | null = null;

			if ((await args?.peekResult('url'))?.isOk()) {
				const videoUrl = await args!.pick('url');

				song = {
					url: videoUrl.toString()
				};

				if (!song.url.includes('youtube') && !song.url.includes('youtu.be')) {
					return message!.reply('Invalid link, try using a youtube video');
				}

				this.addToQueue(serverIndex, song);
			} else {
				song = server.queue[server.currentSongIndex];	
			}

			if (server.player.state.status !== AudioPlayerStatus.Playing) {
				await this.playAudioResource(server.player, server.queue[server.currentSongIndex].url);
				return entersState(server.player, AudioPlayerStatus.Playing, 5000);
			} else {
				return;
			}
		} catch (e) {
			console.log(e);
			throw e;
		}
	}

	public async skipSong(serverIndex: number) {
		await this.stopMusic(undefined, undefined, serverIndex);
		this.serversInfo[serverIndex].currentSongIndex++;
		await this.playMusic(undefined, undefined, serverIndex);
	}

	public async stopMusic(message?: Message, _args?: Args, serverIndex?: number) {
		const s_index = this.serversInfo.findIndex((server: ServerInfo) => server.serverId === message?.guildId);

		let player: AudioPlayer | null = null;

		if (!serverIndex || s_index === -1) {
			return;
		}

		if (!serverIndex) {
			player = this.serversInfo[s_index].player;
		} else {
			player = this.serversInfo[serverIndex].player;
		}

		try {
			entersState(player, AudioPlayerStatus.Paused, 5000);
			//this.currentSongIndex++;
			return player.pause();
		} catch (e) {
			throw e;
		}
	}

	public async seeQueue(message: Message, _args: Args) {

		const serverId = message.guildId;

		const serverIndex = this.serversInfo.findIndex((server: ServerInfo) => server.serverId === serverId);

		if (serverIndex === -1) {
			return;
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
}
