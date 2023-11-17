import {
	container,
	type ChatInputCommandSuccessPayload,
	type Command,
	type ContextMenuCommandSuccessPayload,
	type MessageCommandSuccessPayload
} from '@sapphire/framework';
import { cyan } from 'colorette';
import type { APIUser, Guild, Message, User } from 'discord.js';
import { ServerInfo } from '../interfaces/music.type';
import { AudioPlayer } from '@discordjs/voice';

export function logSuccessCommand(payload: ContextMenuCommandSuccessPayload | ChatInputCommandSuccessPayload | MessageCommandSuccessPayload): void {
	let successLoggerData: ReturnType<typeof getSuccessLoggerData>;

	if ('interaction' in payload) {
		successLoggerData = getSuccessLoggerData(payload.interaction.guild, payload.interaction.user, payload.command);
	} else {
		successLoggerData = getSuccessLoggerData(payload.message.guild, payload.message.author, payload.command);
	}

	container.logger.debug(`${successLoggerData.shard} - ${successLoggerData.commandName} ${successLoggerData.author} ${successLoggerData.sentAt}`);
}

export function getSuccessLoggerData(guild: Guild | null, user: User, command: Command) {
	const shard = getShardInfo(guild?.shardId ?? 0);
	const commandName = getCommandInfo(command);
	const author = getAuthorInfo(user);
	const sentAt = getGuildInfo(guild);

	return { shard, commandName, author, sentAt };
}

function getShardInfo(id: number) {
	return `[${cyan(id.toString())}]`;
}

function getCommandInfo(command: Command) {
	return cyan(command.name);
}

function getAuthorInfo(author: User | APIUser) {
	return `${author.username}[${cyan(author.id)}]`;
}

function getGuildInfo(guild: Guild | null) {
	if (guild === null) return 'Direct Messages';
	return `${guild.name}[${cyan(guild.id)}]`;
}

export function getCurrentServerConnection(servers: ServerInfo[], serverIndex?: number, message?: Message) {
	const s_index = servers.findIndex((server: ServerInfo) => server.serverId === message?.guildId);

	let server: ServerInfo | null = null;

	if (!serverIndex || s_index === -1) {
		servers.push({
			serverId: message?.guildId,
			lastChannelId: null,
			connection: undefined,
			player: new AudioPlayer(),
			queue: [],
			currentSongIndex: 0
		});

		serverIndex = servers.length - 1;
	}

	server = servers[s_index] ?? servers[serverIndex];

	return server;
}
