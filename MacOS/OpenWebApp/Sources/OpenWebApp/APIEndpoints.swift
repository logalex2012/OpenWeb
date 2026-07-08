import Foundation

/// Represents a PATCH-style field that can be left untouched, explicitly cleared,
/// or set to a value — a plain `Int?` can't distinguish "omit" from "set to null"
/// once encoded, but a couple of endpoints (channel.category_id, card.assignee_id)
/// treat those two cases differently.
enum Patch<T: Encodable>: Encodable {
    case omit
    case null
    case value(T)

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .omit: break
        case .null: try container.encodeNil()
        case .value(let v): try container.encode(v)
        }
    }
}

extension KeyedEncodingContainer {
    mutating func encode<T>(_ patch: Patch<T>, forKey key: K) throws {
        switch patch {
        case .omit: return
        case .null: try encodeNil(forKey: key)
        case .value(let v): try encode(v, forKey: key)
        }
    }
}

// MARK: - Response envelopes

struct MeResponse: Codable {
    var user: User
    var settings: WorkspaceSettings
    var onboarding_required: Bool
    var organization: Organization?
}

struct AuthResponse: Codable {
    var user: User
    var csrf_token: String
}

struct OnboardingStatusResponse: Codable {
    var required: Bool
    var organization: Organization?
}

struct OnboardingSetupResponse: Codable {
    var organization: Organization
    var members: [OrganizationMember]
    var user: User
}

struct MembersResponse: Codable { var members: [OrganizationMember] }
struct MemberResponse: Codable { var member: OrganizationMember; var invite_path: String? }

struct ChannelsResponse: Codable { var categories: [ChannelCategory]; var channels: [Channel] }
struct ChannelResponse: Codable { var channel: Channel }
struct CategoryResponse: Codable { var category: ChannelCategory }
struct IconsResponse: Codable { var icons: [String] }
struct PinnedResponse: Codable { var pinned: Bool }
struct PinnedChannelsResponse: Codable { var channels: [Channel] }

struct MessagesResponse: Codable { var messages: [Message] }
struct MessageResponse: Codable { var message: Message }

struct CallResponse: Codable { var call: CallRoom }
struct ActiveCallResponse: Codable { var call: CallRoom? }

struct PollResponse: Codable { var poll: Poll; var message: Message? }
struct PollVoteResponse: Codable { var poll: Poll }

struct KanbanCardsResponse: Codable { var cards: [KanbanCard] }
struct KanbanCardResponse: Codable { var card: KanbanCard }

struct RemindersResponse: Codable { var reminders: [Reminder] }
struct ReminderResponse: Codable { var reminder: Reminder }

struct NotificationsResponse: Codable { var notifications: [NotificationItem]; var unread_count: Int }

struct DocsResponse: Codable { var pages: [DocPage] }
struct DocResponse: Codable { var page: DocPage }

struct SettingsResponse: Codable {
    var profile: User
    var workspace: WorkspaceSettings
    var agent: AgentConfig
    var categories: [ChannelCategory]
    var channels: [Channel]
}

struct ProfileUpdateResponse: Codable { var user: User; var settings: WorkspaceSettings }
struct AvatarUpdateResponse: Codable { var settings: WorkspaceSettings; var avatar_url: String }
struct WorkspaceUpdateResponse: Codable { var settings: WorkspaceSettings }
struct LinkPreviewResponse: Codable { var preview: LinkPreviewData? }

struct AgentConfigResponse: Codable { var config: AgentConfig }
struct AgentRunResponse: Codable { var task: AgentTask; var message: Message?; var user_message: Message? }

struct InviteAcceptResponse: Codable { var user: User; var csrf_token: String; var redirect: String }

// MARK: - Auth & session

extension APIClient {
    func register(email: String, password: String, name: String, company: String?) async throws -> AuthResponse {
        struct Body: Encodable { let email, password, name: String; let company: String? }
        let response: AuthResponse = try await request("/api/auth/register", method: "POST",
            jsonBody: Body(email: email, password: password, name: name, company: company))
        setCSRFToken(response.csrf_token)
        return response
    }

    func login(email: String, password: String) async throws -> AuthResponse {
        struct Body: Encodable { let email, password: String }
        let response: AuthResponse = try await request("/api/auth/login", method: "POST",
            jsonBody: Body(email: email, password: password))
        setCSRFToken(response.csrf_token)
        return response
    }

    func logout() async throws {
        let _: OKResponse = try await request("/api/auth/logout", method: "POST")
    }

    func me() async throws -> MeResponse {
        try await request("/api/me")
    }
}

// MARK: - Onboarding & organization

struct OnboardingMemberInput: Encodable {
    var email: String
    var name: String
    var role: String
}

extension APIClient {
    func onboardingStatus() async throws -> OnboardingStatusResponse {
        try await request("/api/onboarding/status")
    }

    func onboardingSetup(workspaceName: String, description: String?, members: [OnboardingMemberInput]) async throws -> OnboardingSetupResponse {
        struct Body: Encodable { let workspace_name: String; let description: String?; let members: [OnboardingMemberInput] }
        return try await request("/api/onboarding/setup", method: "POST",
            jsonBody: Body(workspace_name: workspaceName, description: description, members: members))
    }

    func listMembers() async throws -> [OrganizationMember] {
        let response: MembersResponse = try await request("/api/organization/members")
        return response.members
    }

    func addMember(email: String, name: String, role: String) async throws -> MemberResponse {
        struct Body: Encodable { let email, name, role: String }
        return try await request("/api/organization/members", method: "POST", jsonBody: Body(email: email, name: name, role: role))
    }

    func resendInvite(memberId: Int) async throws -> MemberResponse {
        try await request("/api/organization/members/\(memberId)/resend-invite", method: "POST")
    }
}

// MARK: - Invite (public)

extension APIClient {
    func acceptInvite(token: String, password: String, name: String?) async throws -> InviteAcceptResponse {
        struct Body: Encodable { let password: String; let name: String? }
        let response: InviteAcceptResponse = try await request("/api/invite/\(token)/accept", method: "POST",
            jsonBody: Body(password: password, name: name))
        setCSRFToken(response.csrf_token)
        return response
    }
}

// MARK: - Channels & categories

extension APIClient {
    func listChannels() async throws -> ChannelsResponse {
        try await request("/api/channels")
    }

    func createChannel(name: String, description: String?, icon: String?, categoryId: Int?, channelType: String?) async throws -> Channel {
        struct Body: Encodable { let name: String; let description, icon: String?; let category_id: Int?; let channel_type: String? }
        let response: ChannelResponse = try await request("/api/channels", method: "POST",
            jsonBody: Body(name: name, description: description, icon: icon, category_id: categoryId, channel_type: channelType))
        return response.channel
    }

    func updateChannel(id: Int, name: String? = nil, description: String? = nil, icon: String? = nil, categoryId: Patch<Int> = .omit) async throws -> Channel {
        struct Body: Encodable {
            let name, description, icon: String?
            let categoryId: Patch<Int>
            enum CodingKeys: String, CodingKey { case name, description, icon; case categoryId = "category_id" }
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encodeIfPresent(name, forKey: .name)
                try c.encodeIfPresent(description, forKey: .description)
                try c.encodeIfPresent(icon, forKey: .icon)
                try c.encode(categoryId, forKey: .categoryId)
            }
        }
        let response: ChannelResponse = try await request("/api/channels/\(id)", method: "PUT",
            jsonBody: Body(name: name, description: description, icon: icon, categoryId: categoryId))
        return response.channel
    }

    func deleteChannel(id: Int) async throws {
        let _: OKResponse = try await request("/api/channels/\(id)", method: "DELETE")
    }

    func createCategory(name: String) async throws -> ChannelCategory {
        struct Body: Encodable { let name: String }
        let response: CategoryResponse = try await request("/api/channel-categories", method: "POST", jsonBody: Body(name: name))
        return response.category
    }

    func updateCategory(id: Int, name: String) async throws -> ChannelCategory {
        struct Body: Encodable { let name: String }
        let response: CategoryResponse = try await request("/api/channel-categories/\(id)", method: "PUT", jsonBody: Body(name: name))
        return response.category
    }

    func deleteCategory(id: Int) async throws {
        let _: OKResponse = try await request("/api/channel-categories/\(id)", method: "DELETE")
    }

    func channelIcons() async throws -> [String] {
        let response: IconsResponse = try await request("/api/channels/icons")
        return response.icons
    }
}

// MARK: - Messages

extension APIClient {
    func listMessages(channelId: Int) async throws -> [Message] {
        let response: MessagesResponse = try await request("/api/channels/\(channelId)/messages")
        return response.messages
    }

    func syncMessages(channelId: Int, afterId: Int) async throws -> SyncResponse {
        try await request("/api/channels/\(channelId)/sync", query: ["after_id": String(afterId)])
    }

    func sendMessage(channelId: Int, content: String, mentions: [Int]) async throws -> Message {
        struct Body: Encodable { let content: String; let mentions: [Int] }
        let response: MessageResponse = try await request("/api/channels/\(channelId)/messages", method: "POST",
            jsonBody: Body(content: content, mentions: mentions))
        return response.message
    }

    func deleteMessage(channelId: Int, messageId: Int) async throws {
        let _: OKResponse = try await request("/api/channels/\(channelId)/messages/\(messageId)", method: "DELETE")
    }

    func pinMessage(channelId: Int, messageId: Int) async throws -> Message {
        let response: MessageResponse = try await request("/api/channels/\(channelId)/messages/\(messageId)/pin", method: "PUT")
        return response.message
    }

    func sendTyping(channelId: Int) async throws {
        let _: OKResponse = try await request("/api/channels/\(channelId)/typing", method: "POST")
    }

    func react(messageId: Int, emoji: String) async throws -> Message {
        struct Body: Encodable { let emoji: String }
        let response: MessageResponse = try await request("/api/messages/\(messageId)/reactions", method: "POST", jsonBody: Body(emoji: emoji))
        return response.message
    }

    func thread(channelId: Int, messageId: Int) async throws -> ThreadResponse {
        try await request("/api/channels/\(channelId)/messages/\(messageId)/thread")
    }

    func reply(channelId: Int, messageId: Int, content: String, mentions: [Int]) async throws -> (reply: Message, parent: Message) {
        struct Body: Encodable { let content: String; let mentions: [Int] }
        struct Response: Codable { let reply: Message; let parent: Message }
        let response: Response = try await request("/api/channels/\(channelId)/messages/\(messageId)/reply", method: "POST",
            jsonBody: Body(content: content, mentions: mentions))
        return (response.reply, response.parent)
    }

    func uploadAttachment(channelId: Int, fileURL: URL, mimeType: String, caption: String?) async throws -> Message {
        var fields: [String: String] = [:]
        if let caption { fields["caption"] = caption }
        let response: MessageResponse = try await upload("/api/channels/\(channelId)/attachments",
            fileFieldName: "file", fileURL: fileURL, mimeType: mimeType, extraFields: fields)
        return response.message
    }
}

// MARK: - Calls

extension APIClient {
    func startCall(channelId: Int) async throws -> CallRoom {
        let response: CallResponse = try await request("/api/channels/\(channelId)/calls", method: "POST")
        return response.call
    }

    func activeCall(channelId: Int) async throws -> CallRoom? {
        let response: ActiveCallResponse = try await request("/api/channels/\(channelId)/calls/active")
        return response.call
    }

    func endCall(channelId: Int, callId: Int) async throws {
        let _: OKResponse = try await request("/api/channels/\(channelId)/calls/\(callId)", method: "DELETE")
    }
}

// MARK: - Polls

extension APIClient {
    func createPoll(channelId: Int, question: String, options: [String]) async throws -> PollResponse {
        struct Body: Encodable { let question: String; let options: [String] }
        return try await request("/api/channels/\(channelId)/polls", method: "POST", jsonBody: Body(question: question, options: options))
    }

    func vote(pollId: Int, optionIndex: Int) async throws -> Poll {
        struct Body: Encodable { let option_index: Int }
        let response: PollVoteResponse = try await request("/api/polls/\(pollId)/vote", method: "POST", jsonBody: Body(option_index: optionIndex))
        return response.poll
    }
}

// MARK: - Kanban

extension APIClient {
    func listCards(channelId: Int) async throws -> [KanbanCard] {
        let response: KanbanCardsResponse = try await request("/api/channels/\(channelId)/kanban")
        return response.cards
    }

    func createCard(channelId: Int, title: String, description: String?, column: String?, color: String?, assigneeId: Int?) async throws -> KanbanCard {
        struct Body: Encodable { let title, description, column, color: String?; let assignee_id: Int? }
        let response: KanbanCardResponse = try await request("/api/channels/\(channelId)/kanban", method: "POST",
            jsonBody: Body(title: title, description: description, column: column, color: color, assignee_id: assigneeId))
        return response.card
    }

    func updateCard(channelId: Int, cardId: Int, title: String? = nil, description: String? = nil, column: String? = nil, position: Int? = nil, color: String? = nil, assigneeId: Patch<Int> = .omit) async throws -> KanbanCard {
        struct Body: Encodable {
            let title, description, column, color: String?
            let position: Int?
            let assigneeId: Patch<Int>
            enum CodingKeys: String, CodingKey { case title, description, column, color, position; case assigneeId = "assignee_id" }
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encodeIfPresent(title, forKey: .title)
                try c.encodeIfPresent(description, forKey: .description)
                try c.encodeIfPresent(column, forKey: .column)
                try c.encodeIfPresent(color, forKey: .color)
                try c.encodeIfPresent(position, forKey: .position)
                try c.encode(assigneeId, forKey: .assigneeId)
            }
        }
        let response: KanbanCardResponse = try await request("/api/channels/\(channelId)/kanban/\(cardId)", method: "PUT",
            jsonBody: Body(title: title, description: description, column: column, color: color, position: position, assigneeId: assigneeId))
        return response.card
    }

    func deleteCard(channelId: Int, cardId: Int) async throws {
        let _: OKResponse = try await request("/api/channels/\(channelId)/kanban/\(cardId)", method: "DELETE")
    }
}

// MARK: - Reminders

extension APIClient {
    func createReminder(messageId: Int?, when: String) async throws -> Reminder {
        struct Body: Encodable { let message_id: Int?; let when: String }
        let response: ReminderResponse = try await request("/api/reminders", method: "POST", jsonBody: Body(message_id: messageId, when: when))
        return response.reminder
    }

    func listReminders() async throws -> [Reminder] {
        let response: RemindersResponse = try await request("/api/reminders")
        return response.reminders
    }

    func dueReminders() async throws -> [Reminder] {
        let response: RemindersResponse = try await request("/api/reminders/due")
        return response.reminders
    }

    func deleteReminder(id: Int) async throws {
        let _: OKResponse = try await request("/api/reminders/\(id)", method: "DELETE")
    }
}

// MARK: - Notifications

extension APIClient {
    func listNotifications() async throws -> NotificationsResponse {
        try await request("/api/notifications")
    }

    func markNotificationRead(id: Int) async throws {
        let _: OKResponse = try await request("/api/notifications/\(id)/read", method: "POST")
    }

    func markAllNotificationsRead() async throws {
        let _: OKResponse = try await request("/api/notifications/read-all", method: "POST")
    }
}

// MARK: - Docs

extension APIClient {
    func listDocs(channelId: Int?) async throws -> [DocPage] {
        var query: [String: String] = [:]
        if let channelId { query["channel_id"] = String(channelId) }
        let response: DocsResponse = try await request("/api/docs", query: query)
        return response.pages
    }

    func createDoc(title: String, content: String?, icon: String?, channelId: Int?) async throws -> DocPage {
        struct Body: Encodable { let title: String; let content, icon: String?; let channel_id: Int? }
        let response: DocResponse = try await request("/api/docs", method: "POST",
            jsonBody: Body(title: title, content: content, icon: icon, channel_id: channelId))
        return response.page
    }

    func getDoc(id: Int) async throws -> DocPage {
        let response: DocResponse = try await request("/api/docs/\(id)")
        return response.page
    }

    func updateDoc(id: Int, title: String?, content: String?, icon: String?) async throws -> DocPage {
        struct Body: Encodable { let title, content, icon: String? }
        let response: DocResponse = try await request("/api/docs/\(id)", method: "PUT", jsonBody: Body(title: title, content: content, icon: icon))
        return response.page
    }

    func deleteDoc(id: Int) async throws {
        let _: OKResponse = try await request("/api/docs/\(id)", method: "DELETE")
    }
}

// MARK: - Search

extension APIClient {
    func search(query: String) async throws -> SearchResponse {
        try await request("/api/search", query: ["q": query])
    }
}

// MARK: - Settings

extension APIClient {
    func getSettings() async throws -> SettingsResponse {
        try await request("/api/settings")
    }

    func updateProfile(name: String?, company: String?, email: String?, jobTitle: String?, statusMessage: String?) async throws -> ProfileUpdateResponse {
        struct Body: Encodable { let name, company, email, job_title, status_message: String? }
        return try await request("/api/settings/profile", method: "PUT",
            jsonBody: Body(name: name, company: company, email: email, job_title: jobTitle, status_message: statusMessage))
    }

    func uploadAvatar(fileURL: URL, mimeType: String) async throws -> AvatarUpdateResponse {
        try await upload("/api/settings/avatar", fileFieldName: "avatar", fileURL: fileURL, mimeType: mimeType)
    }

    func deleteAvatar() async throws -> WorkspaceSettings {
        struct Response: Codable { let settings: WorkspaceSettings }
        let response: Response = try await request("/api/settings/avatar", method: "DELETE")
        return response.settings
    }

    func updatePassword(current: String, new: String) async throws {
        struct Body: Encodable { let current_password, new_password: String }
        let _: OKResponse = try await request("/api/settings/password", method: "PUT", jsonBody: Body(current_password: current, new_password: new))
    }

    func updateWorkspace(workspaceName: String?, theme: String?, compactMode: Bool?, notifications: Bool?, defaultChannelSlug: String?) async throws -> WorkspaceSettings {
        struct Body: Encodable {
            let workspace_name, theme: String?
            let compact_mode, notifications: Bool?
            let default_channel_slug: String?
        }
        let response: WorkspaceUpdateResponse = try await request("/api/settings/workspace", method: "PUT",
            jsonBody: Body(workspace_name: workspaceName, theme: theme, compact_mode: compactMode, notifications: notifications, default_channel_slug: defaultChannelSlug))
        return response.settings
    }

    func linkPreview(url: String) async throws -> LinkPreviewData? {
        let response: LinkPreviewResponse = try await request("/api/link-preview", query: ["url": url])
        return response.preview
    }
}

// MARK: - Agent

extension APIClient {
    func getAgentConfig() async throws -> AgentConfig {
        let response: AgentConfigResponse = try await request("/api/agent/config")
        return response.config
    }

    func updateAgentConfig(name: String?, tone: String?, platforms: [String]?, enabled: Bool?) async throws -> AgentConfig {
        struct Body: Encodable { let name, tone: String?; let platforms: [String]?; let enabled: Bool? }
        let response: AgentConfigResponse = try await request("/api/agent/config", method: "PUT",
            jsonBody: Body(name: name, tone: tone, platforms: platforms, enabled: enabled))
        return response.config
    }

    func runAgent(prompt: String, channelId: Int?) async throws -> AgentRunResponse {
        struct Body: Encodable { let prompt: String; let channel_id: Int? }
        return try await request("/api/agent/run", method: "POST", jsonBody: Body(prompt: prompt, channel_id: channelId))
    }
}
