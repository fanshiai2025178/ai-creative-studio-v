CREATE TABLE `assetLibrary` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`category` enum('subject','scene','prop','action','style') NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`imageUrl` text NOT NULL,
	`imageKey` varchar(512) NOT NULL,
	`thumbnailUrl` text,
	`mimeType` varchar(128),
	`size` int,
	`tags` json,
	`metadata` json,
	`isFavorite` boolean NOT NULL DEFAULT false,
	`usageCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assetLibrary_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int,
	`nodeId` varchar(64),
	`type` enum('image','video','audio') NOT NULL,
	`url` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`filename` varchar(255),
	`mimeType` varchar(128),
	`size` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customStyles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`referenceImageUrl` text NOT NULL,
	`referenceImageKey` varchar(512) NOT NULL,
	`stylePrompt` text,
	`isPublic` boolean NOT NULL DEFAULT false,
	`usageCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customStyles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `designs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`canvasId` int NOT NULL,
	`scriptId` int,
	`characters` json,
	`scenes` json,
	`props` json,
	`colorHarmony` json,
	`styleConsistency` text,
	`visualStyle` varchar(64),
	`styleReferenceImage` text,
	`styleDescription` text,
	`architecturalStyle` varchar(128),
	`colorPalette` json,
	`stylePreviewImages` json,
	`designNotes` text,
	`version` int NOT NULL DEFAULT 1,
	`status` enum('draft','generated','completed') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `designs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generationTasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int,
	`nodeId` varchar(64),
	`taskType` enum('text2img','img2img','img2video','upscale','edit') NOT NULL,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`inputData` json,
	`outputData` json,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `generationTasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT '未命名项目',
	`description` text,
	`thumbnail` text,
	`workflowData` json,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `promptGroups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `promptGroups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`groupId` int NOT NULL,
	`content` text NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `prompts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`canvasId` int NOT NULL,
	`title` varchar(255) NOT NULL DEFAULT '新剧本',
	`originalContent` text,
	`adaptedStory` text,
	`adaptationAnalysis` text,
	`storyType` varchar(64),
	`targetPlatform` varchar(64),
	`targetAudience` varchar(64),
	`episodeCount` int DEFAULT 0,
	`totalDuration` int DEFAULT 0,
	`durationPerEpisode` int DEFAULT 120,
	`storyStructure` json,
	`episodes` json,
	`qualityMetrics` json,
	`rawContent` text,
	`version` int NOT NULL DEFAULT 1,
	`status` enum('draft','generated','optimized','completed') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scripts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `storyboardShots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`scriptId` int NOT NULL,
	`shotNumber` int NOT NULL,
	`title` varchar(255),
	`shotType` enum('特写','近景','中景','全景','远景') NOT NULL DEFAULT '中景',
	`duration` int DEFAULT 3,
	`transition` enum('切入','淡入','淡出','叠化','划入','划出') NOT NULL DEFAULT '切入',
	`sceneDescription` text,
	`characters` text,
	`action` text,
	`dialogue` text,
	`emotion` text,
	`characterRefs` json,
	`sceneRefs` json,
	`propRefs` json,
	`aiPrompt` text,
	`generatedImageUrl` text,
	`generatedImageKey` varchar(512),
	`imageSize` enum('9:16','16:9','1:1','4:3','3:4') NOT NULL DEFAULT '16:9',
	`composition` enum('居中构图','三分法','对角线构图','框架构图','引导线构图') NOT NULL DEFAULT '三分法',
	`sketchDataUrl` text,
	`sketchDescription` text,
	`dynamicPrompt` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `storyboardShots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflowTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(64),
	`thumbnail` text,
	`workflowData` json NOT NULL,
	`isPublic` boolean NOT NULL DEFAULT true,
	`usageCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflowTemplates_id` PRIMARY KEY(`id`)
);
