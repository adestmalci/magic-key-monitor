import SwiftUI
import Foundation

struct PairingPayload: Codable {
    let appUrl: String
    let token: String
    let deviceId: String
    let deviceName: String
}

final class WorkerController: ObservableObject {
    @Published var status = "Stopped"
    @Published var lastMessage = "The local Disney worker is not running yet."
    @Published var lastError = ""

    @AppStorage("repoPath") var repoPath: String = WorkerController.defaultRepoPath
    @AppStorage("profilePath") var profilePath: String = WorkerController.defaultProfilePath
    @AppStorage("deviceName") var deviceName: String = Host.current().localizedName ?? "My Mac"
    @AppStorage("pairPayload") var pairPayload = ""

    private var workerProcess: Process?

    static var defaultRepoPath: String = {
        let file = URL(fileURLWithPath: #filePath)
        return file.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().path
    }()

    static var defaultProfilePath: String = {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return appSupport.appendingPathComponent("Magic Key Monitor/disney-profile", isDirectory: true).path
    }()

    private func decodePayload() throws -> PairingPayload {
        let data = Data(pairPayload.utf8)
        return try JSONDecoder().decode(PairingPayload.self, from: data)
    }

    func startWorker() {
        do {
            let payload = try decodePayload()
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/zsh")
            process.currentDirectoryURL = URL(fileURLWithPath: repoPath)
            process.environment = [
                "PATH": ProcessInfo.processInfo.environment["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",
                "MAGIC_KEY_APP_URL": payload.appUrl,
                "MAGIC_KEY_LOCAL_WORKER_TOKEN": payload.token,
                "MAGIC_KEY_LOCAL_DEVICE_ID": payload.deviceId,
                "MAGIC_KEY_LOCAL_DEVICE_NAME": deviceName.isEmpty ? payload.deviceName : deviceName,
                "MAGIC_KEY_LOCAL_PROFILE_DIR": profilePath
            ]
            process.arguments = ["-lc", "npm run worker:disney:local"]
            process.terminationHandler = { [weak self] task in
                DispatchQueue.main.async {
                    self?.status = "Stopped"
                    self?.lastMessage = "The local Disney worker stopped."
                    if task.terminationStatus != 0 {
                        self?.lastError = "Worker exited with code \(task.terminationStatus). Check the repo terminal or logs."
                    }
                }
            }
            try process.run()
            workerProcess = process
            status = "Running"
            lastError = ""
            lastMessage = "The local Disney worker is polling for Disney jobs on this Mac."
        } catch {
            status = "Stopped"
            lastError = error.localizedDescription
            lastMessage = "The local Disney worker could not start."
        }
    }

    func stopWorker() {
        workerProcess?.terminate()
        workerProcess = nil
        status = "Stopped"
        lastMessage = "The local Disney worker is stopped."
    }

    func openDisneyLogin() {
        do {
            let payload = try decodePayload()
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/zsh")
            process.currentDirectoryURL = URL(fileURLWithPath: repoPath)
            process.environment = [
                "PATH": ProcessInfo.processInfo.environment["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",
                "MAGIC_KEY_APP_URL": payload.appUrl,
                "MAGIC_KEY_LOCAL_PROFILE_DIR": profilePath
            ]
            process.arguments = ["-lc", "npm run worker:disney:login"]
            try process.run()
            lastError = ""
            lastMessage = "Opened the dedicated Disney login window for this Mac."
        } catch {
            lastError = error.localizedDescription
            lastMessage = "Could not open the local Disney login window."
        }
    }
}

struct TrayContentView: View {
    @ObservedObject var controller: WorkerController

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Magic Key Disney Worker")
                .font(.headline)

            VStack(alignment: .leading, spacing: 8) {
                Text("Status")
                    .font(.subheadline.weight(.semibold))
                Text(controller.status)
                Text(controller.lastMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if !controller.lastError.isEmpty {
                    Text(controller.lastError)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }

            TextField("Device name", text: $controller.deviceName)
            TextField("Repo path", text: $controller.repoPath)
            TextField("Local Disney profile path", text: $controller.profilePath)
            TextEditor(text: $controller.pairPayload)
                .font(.system(.caption, design: .monospaced))
                .frame(height: 120)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.gray.opacity(0.2)))

            HStack {
                Button("Start worker") {
                    controller.startWorker()
                }
                Button("Stop worker") {
                    controller.stopWorker()
                }
            }

            Button("Open Disney local login") {
                controller.openDisneyLogin()
            }

            Text("Paste the pairing payload from Reserve, then start the worker on this Mac.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .frame(width: 420)
    }
}

@main
struct MagicKeyDisneyWorkerTrayApp: App {
    @StateObject private var controller = WorkerController()

    var body: some Scene {
        MenuBarExtra("Magic Key Worker", systemImage: "sparkles") {
            TrayContentView(controller: controller)
        }
        Window("Magic Key Disney Worker", id: "main") {
            TrayContentView(controller: controller)
        }
        .defaultSize(width: 440, height: 520)
    }
}
