import SwiftUI
import Foundation
import AppKit

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
    private var workerOutputPipe: Pipe?
    private var shouldKeepWorkerAlive = false
    private var intentionalStop = false

    var isRunning: Bool {
        status == "Running" && workerProcess?.isRunning == true
    }

    static var defaultRepoPath: String = {
        let file = URL(fileURLWithPath: #filePath)
        return file
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .path
    }()

    static var defaultProfilePath: String = {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return appSupport.appendingPathComponent("Magic Key Monitor/disney-profile", isDirectory: true).path
    }()

    private func decodePayload() throws -> PairingPayload {
        let data = Data(pairPayload.utf8)
        return try JSONDecoder().decode(PairingPayload.self, from: data)
    }

    private func configureOutputCapture(for process: Process) {
        let pipe = Pipe()
        workerOutputPipe = pipe
        process.standardOutput = pipe
        process.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else {
                return
            }

            DispatchQueue.main.async {
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return }
                self?.lastMessage = trimmed
            }
        }
    }

    func importPayloadFromClipboard() {
        guard let raw = NSPasteboard.general.string(forType: .string) else {
            lastError = "Clipboard is empty."
            lastMessage = "Copy the pairing payload from Reserve first."
            return
        }

        do {
            let data = Data(raw.utf8)
            let payload = try JSONDecoder().decode(PairingPayload.self, from: data)
            pairPayload = raw
            if deviceName.isEmpty {
                deviceName = payload.deviceName
            }
            lastError = ""
            lastMessage = "Imported the pairing payload from the clipboard."
        } catch {
            lastError = "Clipboard does not contain a valid pairing payload."
            lastMessage = "Copy the full JSON pairing payload from Reserve and try again."
        }
    }

    func startWorker() {
        if isRunning {
            lastError = ""
            lastMessage = "The local Disney worker is already running on this Mac."
            return
        }

        do {
            let payload = try decodePayload()
            shouldKeepWorkerAlive = true
            intentionalStop = false
            try launchWorker(payload: payload)
            status = "Running"
            lastError = ""
            lastMessage = "The local Disney worker is polling for Disney jobs on this Mac."
        } catch {
            shouldKeepWorkerAlive = false
            intentionalStop = false
            status = "Stopped"
            lastError = error.localizedDescription
            lastMessage = "The local Disney worker could not start."
        }
    }

    func stopWorker() {
        guard isRunning else {
            shouldKeepWorkerAlive = false
            lastError = ""
            lastMessage = "The local Disney worker is already stopped."
            return
        }
        shouldKeepWorkerAlive = false
        intentionalStop = true
        workerProcess?.terminate()
        workerProcess = nil
        workerOutputPipe?.fileHandleForReading.readabilityHandler = nil
        workerOutputPipe = nil
        status = "Stopped"
        lastMessage = "The local Disney worker is stopped."
    }

    private func launchWorker(payload: PairingPayload) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.currentDirectoryURL = URL(fileURLWithPath: repoPath)
        configureOutputCapture(for: process)
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
                guard let self else { return }
                self.workerOutputPipe?.fileHandleForReading.readabilityHandler = nil
                self.workerOutputPipe = nil
                self.workerProcess = nil
                self.status = "Stopped"

                let shouldRestart = self.shouldKeepWorkerAlive && !self.intentionalStop
                let exitCode = task.terminationStatus

                if shouldRestart {
                    self.lastError = exitCode == 0 ? "" : "Worker exited with code \(exitCode). Restarting automatically."
                    self.lastMessage = "The local Disney worker stopped unexpectedly. Restarting now."
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        guard self.shouldKeepWorkerAlive else { return }
                        do {
                            let nextPayload = try self.decodePayload()
                            try self.launchWorker(payload: nextPayload)
                            self.status = "Running"
                            self.lastError = ""
                            self.lastMessage = "The local Disney worker restarted and is polling for Disney jobs on this Mac."
                        } catch {
                            self.shouldKeepWorkerAlive = false
                            self.status = "Stopped"
                            self.lastError = error.localizedDescription
                            self.lastMessage = "The local Disney worker could not restart automatically."
                        }
                    }
                    return
                }

                self.intentionalStop = false
                if exitCode == 0 {
                    self.lastMessage = "The local Disney worker stopped."
                    self.lastError = ""
                } else {
                    self.lastError = "Worker exited with code \(exitCode). Check the repo terminal or logs."
                    if self.lastMessage == "The local Disney worker is polling for Disney jobs on this Mac." {
                        self.lastMessage = "The local Disney worker stopped before it could start cleanly."
                    }
                }
            }
        }
        try process.run()
        workerProcess = process
    }

    func openDisneyLogin() {
        do {
            let payload = try decodePayload()
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/zsh")
            process.currentDirectoryURL = URL(fileURLWithPath: repoPath)
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = pipe
            process.environment = [
                "PATH": ProcessInfo.processInfo.environment["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",
                "MAGIC_KEY_APP_URL": payload.appUrl,
                "MAGIC_KEY_LOCAL_PROFILE_DIR": profilePath
            ]
            process.arguments = ["-lc", "npm run worker:disney:login"]
            process.terminationHandler = { [weak self] task in
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                DispatchQueue.main.async {
                    if task.terminationStatus == 0 {
                        self?.lastError = ""
                        self?.lastMessage = "Opened the dedicated Disney login window for this Mac."
                    } else {
                        self?.lastError = "Disney login helper exited with code \(task.terminationStatus)."
                        self?.lastMessage = text.isEmpty ? "Could not open the local Disney login window." : text
                    }
                }
            }
            try process.run()
        } catch {
            lastError = error.localizedDescription
            lastMessage = "Could not open the local Disney login window."
        }
    }
}

struct TrayContentView: View {
    @ObservedObject var controller: WorkerController

    var body: some View {
        ScrollView {
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

                VStack(alignment: .leading, spacing: 6) {
                    Text("Device name")
                        .font(.subheadline.weight(.semibold))
                    TextField("Arya's iMac", text: $controller.deviceName)
                        .textFieldStyle(.roundedBorder)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Repo path (Magic Key Monitor folder)")
                        .font(.subheadline.weight(.semibold))
                    TextField("/Users/aryadestmalci/magic-key-monitor", text: $controller.repoPath)
                        .textFieldStyle(.roundedBorder)
                    Text("This should be the main `magic-key-monitor` folder, not the `macos` subfolder.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Local Disney profile path")
                        .font(.subheadline.weight(.semibold))
                    TextField("/Users/aryadestmalci/Library/Application Support/Magic Key Monitor/disney-profile", text: $controller.profilePath)
                        .textFieldStyle(.roundedBorder)
                    Text("This is the dedicated on-device browser profile where Disney session cookies will live.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Pairing payload from Reserve")
                        .font(.subheadline.weight(.semibold))
                    TextEditor(text: $controller.pairPayload)
                        .font(.system(.caption, design: .monospaced))
                        .frame(height: 140)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.gray.opacity(0.2)))
                    Text("Paste the full JSON block from `Create local pair token`, or use the clipboard import button.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                HStack {
                    Button("Import payload from clipboard") {
                        controller.importPayloadFromClipboard()
                    }
                    Button("Start worker") {
                        controller.startWorker()
                    }
                    .disabled(controller.isRunning)
                    Button("Stop worker") {
                        controller.stopWorker()
                    }
                    .disabled(!controller.isRunning)
                }

                Button("Open Disney local login") {
                    controller.openDisneyLogin()
                }

                Text("Recommended order: import payload, start worker, then open Disney local login on this Mac.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(16)
        }
        .frame(width: 460, height: 560)
    }
}

struct TrayMenuView: View {
    @ObservedObject var controller: WorkerController
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Magic Key Disney Worker")
                .font(.headline)
            Text(controller.status)
                .font(.subheadline.weight(.semibold))
            Text(controller.lastMessage)
                .font(.caption)
                .foregroundStyle(.secondary)

            Divider()

            Button("Open control window") {
                openWindow(id: "main")
                NSApplication.shared.activate(ignoringOtherApps: true)
            }

            Button("Import payload from clipboard") {
                controller.importPayloadFromClipboard()
            }

            Button("Start worker") {
                controller.startWorker()
            }
            .disabled(controller.isRunning)

            Button("Open Disney local login") {
                controller.openDisneyLogin()
            }

            Button("Stop worker") {
                controller.stopWorker()
            }
            .disabled(!controller.isRunning)
        }
        .padding(14)
        .frame(width: 280)
    }
}

@main
struct MagicKeyDisneyWorkerTrayApp: App {
    @StateObject private var controller = WorkerController()

    var body: some Scene {
        MenuBarExtra("Magic Key Worker", systemImage: "sparkles") {
            TrayMenuView(controller: controller)
        }
        Window("Magic Key Disney Worker", id: "main") {
            TrayContentView(controller: controller)
        }
        .defaultSize(width: 440, height: 520)
    }
}
