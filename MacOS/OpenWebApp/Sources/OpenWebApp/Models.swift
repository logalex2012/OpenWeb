import Foundation

// MARK: - Core

struct User: Codable, Identifiable, Equatable {
    let id: Int
    var email: String
    var name: String
    var company: String?
    var role: String
    var organization_id: Int?
}

struct Organization: Codable, Equatable {
    let id: Int
    var name: String
    var description: String?
    var owner_id: Int
    var members_count: Int
}

struct WorkspaceSettings: Codable, Equatable {
    var workspace_name: String?
    var job_title: String?
    var status_message: String?
    var theme: String?
    var compact_mode: Bool?
    var notifications: Bool?
    var default_channel_slug: String?
    var avatar_url: String?
}

struct ChannelCategory: Codable, Identifiable, Equatable {
    let id: Int
    var organization_id: Int
    var name: String
    var position: Int
}

struct Channel: Codable, Identifiable, Equatable, Hashable {
    let id: Int
    var organization_id: Int
    var category_id: Int?
    var name: String
    var slug: String
    var description: String?
    var channel_type: String
    var icon: String?
    var position: Int

    static func == (lhs: Channel, rhs: Channel) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct Attachment: Codable, Equatable {
    let id: Int
    var original_name: String
    var url: String
    var size: Int
    var mime_type: String?
}

struct Reaction: Codable, Equatable, Identifiable {
    var emoji: String
    var count: Int
    var mine: Bool
    var id: String { emoji }
}

struct PollOption: Codable, Equatable, Identifiable {
    var index: Int
    var text: String
    var votes: Int
    var percent: Int
    var id: Int { index }
}

struct Poll: Codable, Equatable {
    let id: Int
    var question: String
    var options: [PollOption]
    var total_votes: Int
    var user_vote: Int?
}

struct Message: Codable, Identifiable, Equatable {
    let id: Int
    var channel_id: Int
    var user_id: Int?
    var author_name: String
    var author_avatar_url: String?
    var content: String
    var is_agent: Bool
    var is_pinned: Bool
    var attachment: Attachment?
    var reactions: [Reaction]
    var created_at: Date
    var parent_id: Int?
    var reply_count: Int
    var poll: Poll?
    var deleted: Bool?
}

struct TypingUser: Codable, Identifiable {
    var user_id: Int
    var name: String
    var id: Int { user_id }
}

struct SyncResponse: Codable {
    var new_messages: [Message]
    var updated_messages: [Message]
    var typing: [TypingUser]
}

struct ThreadResponse: Codable {
    var parent: Message
    var replies: [Message]
}

// MARK: - Organization / members

struct OrganizationMember: Codable, Identifiable, Equatable {
    let id: Int
    var email: String
    var name: String
    var role: String
    var status: String
    var user_id: Int?
    var avatar_url: String?
}

// MARK: - Calls

struct CallRoom: Codable, Identifiable, Equatable {
    let id: Int
    var channel_id: Int
    var token: String
    var jitsi_url: String
    var created_by_name: String
    var ended_at: Date?
    var created_at: Date
}

// MARK: - Kanban

struct KanbanCard: Codable, Identifiable, Equatable {
    let id: Int
    var channel_id: Int
    var title: String
    var description: String?
    var column: String
    var position: Int
    var color: String?
    var created_by_name: String
    var assignee_id: Int?
    var assignee_name: String?
    var created_at: Date
}

// MARK: - Reminders

struct Reminder: Codable, Identifiable, Equatable {
    let id: Int
    var channel_id: Int?
    var message_id: Int?
    var message_preview: String?
    var remind_at: Date
    var sent: Bool
}

// MARK: - Notifications

struct NotificationItem: Codable, Identifiable, Equatable {
    let id: Int
    var type: String
    var actor_name: String?
    var actor_avatar_url: String?
    var channel_id: Int?
    var channel_name: String?
    var channel_icon: String?
    var message_id: Int?
    var card_id: Int?
    var preview: String?
    var is_read: Bool
    var created_at: Date
}

// MARK: - Docs

struct DocPage: Codable, Identifiable, Equatable {
    let id: Int
    var organization_id: Int
    var channel_id: Int?
    var title: String
    var content: String?
    var icon: String?
    var created_by_name: String?
    var created_at: Date
    var updated_at: Date
}

// MARK: - Agent

struct AgentConfig: Codable, Equatable {
    var id: Int?
    var name: String
    var tone: String
    var platforms: [String]
    var enabled: Bool
}

struct AgentTask: Codable, Identifiable {
    let id: Int
    var prompt: String
    var response: String?
    var status: String
    var created_at: Date
}

// MARK: - Search

struct SearchMessageHit: Codable, Identifiable {
    let id: Int
    var channel_id: Int
    var user_id: Int?
    var author_name: String
    var author_avatar_url: String?
    var content: String
    var is_agent: Bool
    var is_pinned: Bool
    var created_at: Date
    var channel_name: String?
    var channel_icon: String?
}

struct SearchResponse: Codable {
    var messages: [SearchMessageHit]
    var pages: [DocPage]
}

// MARK: - Link preview

struct LinkPreviewData: Codable, Equatable {
    var url: String
    var title: String?
    var description: String?
    var image_url: String?
    var site_name: String?
}
