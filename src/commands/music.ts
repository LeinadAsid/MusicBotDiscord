import { ApplyOptions } from '@sapphire/decorators';
import { Args, Command } from '@sapphire/framework';
import { Subcommand } from '@sapphire/plugin-subcommands';
import type { Message } from 'discord.js';
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

@ApplyOptions<Command.Options>({
	description: 'Music Commands to add, remove and manage songs on queue.'
})
export class UserCommand extends Subcommand {
	player = createAudioPlayer();
	connection: VoiceConnection | undefined = undefined;

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

			const audio = ytdl(videoUrl.toString(), {filter: 'audioonly'});

			const resource = createAudioResource(audio, {
				inputType: StreamType.Arbitrary,
				inlineVolume: true
			});

			this.player.play(resource);

			return entersState(this.player, AudioPlayerStatus.Playing, 5000);
		} catch (e) {
			console.log(e);
			throw e;
		}
	}

	public async stopMusic(_message: Message, _args: Args) {
		try {
			entersState(this.player, AudioPlayerStatus.Idle, 5000);
			return this.player.stop();
		} catch (e) {
			throw e;
		}
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
