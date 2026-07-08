import Foundation
import Observation

enum SessionState: Equatable {
    case loading
    case loggedOut
    case onboarding
    case ready
}

@MainActor
@Observable
final class AppState {
    var session: SessionState = .loading
    var user: User?
    var settings: WorkspaceSettings?
    var organization: Organization?

    var categories: [ChannelCategory] = []
    var channels: [Channel] = []
    var selectedChannelId: Int?

    var members: [OrganizationMember] = []
    var unreadNotifications: Int = 0

    var globalError: String?
    var isBusy = false

    let api = APIClient.shared

    init() {
        api.onUnauthorized = { [weak self] in
            Task { @MainActor in
                self?.session = .loggedOut
                self?.user = nil
            }
        }
    }

    var selectedChannel: Channel? {
        channels.first { $0.id == selectedChannelId }
    }

    func bootstrap() async {
        await api.bootstrapCSRFToken()
        do {
            let me = try await api.me()
            user = me.user
            settings = me.settings
            organization = me.organization
            if me.onboarding_required {
                session = .onboarding
            } else {
                session = .ready
                await loadWorkspace()
            }
        } catch {
            session = .loggedOut
        }
    }

    func loadWorkspace() async {
        async let channelsResult: ChannelsResponse? = try? api.listChannels()
        async let membersResult: [OrganizationMember]? = try? api.listMembers()
        async let notificationsResult: NotificationsResponse? = try? api.listNotifications()

        if let response = await channelsResult {
            categories = response.categories.sorted { $0.position < $1.position }
            channels = response.channels.sorted { $0.position < $1.position }
            if selectedChannelId == nil {
                let defaultSlug = settings?.default_channel_slug
                selectedChannelId = channels.first(where: { $0.slug == defaultSlug })?.id ?? channels.first?.id
            }
        }
        if let members = await membersResult {
            self.members = members
        }
        if let notifications = await notificationsResult {
            unreadNotifications = notifications.unread_count
        }
    }

    func login(email: String, password: String) async {
        isBusy = true
        defer { isBusy = false }
        do {
            let response = try await api.login(email: email, password: password)
            user = response.user
            await bootstrap()
        } catch {
            globalError = error.localizedDescription
        }
    }

    func register(email: String, password: String, name: String, company: String?) async {
        isBusy = true
        defer { isBusy = false }
        do {
            let response = try await api.register(email: email, password: password, name: name, company: company)
            user = response.user
            await bootstrap()
        } catch {
            globalError = error.localizedDescription
        }
    }

    func logout() async {
        try? await api.logout()
        session = .loggedOut
        user = nil
        settings = nil
        organization = nil
        channels = []
        categories = []
        members = []
        selectedChannelId = nil
    }

    func completeOnboarding(workspaceName: String, description: String?, members: [OnboardingMemberInput]) async {
        isBusy = true
        defer { isBusy = false }
        do {
            let response = try await api.onboardingSetup(workspaceName: workspaceName, description: description, members: members)
            organization = response.organization
            user = response.user
            session = .ready
            await loadWorkspace()
        } catch {
            globalError = error.localizedDescription
        }
    }

    func refreshMembers() async {
        if let members = try? await api.listMembers() {
            self.members = members
        }
    }

    func refreshChannels() async {
        if let response = try? await api.listChannels() {
            categories = response.categories.sorted { $0.position < $1.position }
            channels = response.channels.sorted { $0.position < $1.position }
        }
    }

    func refreshNotificationCount() async {
        if let response = try? await api.listNotifications() {
            unreadNotifications = response.unread_count
        }
    }
}
