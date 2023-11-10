import { ApplyOptions } from '@sapphire/decorators';
import { Args, Command } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import { type Message, EmbedBuilder } from 'discord.js';
import {
	AudioPlayerStatus,
	StreamType,
	VoiceConnection,
	VoiceConnectionStatus,
	createAudioPlayer,
	createAudioResource,
	entersState,
	joinVoiceChannel
} from '@discordjs/voice';

import ytdl from 'ytdl-core';
import { Song } from '../interfaces/music.type';

@ApplyOptions<Command.Options>({
	description: 'Music Commands to add, remove and manage songs on queue.'
})
export class UserCommand extends Subcommand {
	player = createAudioPlayer();
	connection: VoiceConnection | undefined = undefined;

	queue: Song[] = [];

	currentSongIndex = 0;

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
					name: 'viewQueue',
					messageRun: 'seeQueue'
				}
			]
		});
	}

	public async playMusic(message: Message, args: Args) {
		try {
			if (!this.connection) {
				this.connection = await this.connect(message);
			}

			if (!this.connection) {
				throw `Couldn't connect to voice channel.`;
			}

			this.connection.subscribe(this.player);

			const videoUrl = await args.pick('url');

			const song: Song = {
				url: videoUrl.toString()
			};

			this.addToQueue(song);

			console.log(this.queue);

			if (this.player.state.status !== AudioPlayerStatus.Playing) {
				this.playAudioResource(this.queue[this.currentSongIndex].url);

				this.player.on('stateChange', (oldState, newState) => {
					if (oldState.status === AudioPlayerStatus.Playing && newState.status === AudioPlayerStatus.Idle) {
						if (this.currentSongIndex + 1 > this.queue.length - 1) {
							this.currentSongIndex = 0;
						} else {
							this.currentSongIndex += 1;
						}

						this.playAudioResource(this.queue[this.currentSongIndex].url);
					}
				});

				return entersState(this.player, AudioPlayerStatus.Playing, 5000);
			} else {
				return;
			}
		} catch (e) {
			console.log(e);
			throw e;
		}
	}

	public async stopMusic(_message: Message, _args: Args) {
		try {
			entersState(this.player, AudioPlayerStatus.Paused, 5000);
			return this.player.pause();
		} catch (e) {
			throw e;
		}
	}

	public async seeQueue(message: Message, _args: Args) {
		const embed = new EmbedBuilder().setTitle('Current Songs Queued').setColor('Red');

		this.queue.forEach((song: Song) => {
			embed.addFields({ name: song.name ?? 'noname', value: song.url });
		});

		return await message.channel.send({ embeds: [embed] });
	}

	private async playAudioResource(url: string) {
		const audio = ytdl(url.toString(), { filter: 'audioonly', dlChunkSize: 4096, highWaterMark: 1 << 30, liveBuffer: 20000 });

		const resource = createAudioResource(audio, {
			inputType: StreamType.Arbitrary,
			inlineVolume: true
		});

		this.player.play(resource);
	}

	private async addToQueue(song: Song) {
		this.queue.push(song);
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
