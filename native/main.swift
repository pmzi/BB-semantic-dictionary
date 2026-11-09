import Foundation
import FoundationModels

@Generable
struct Entry {
  @Guide(description: "One short plain-English sentence: what the quoted part means in this sentence")
  var meaning: String
  @Guide(description: "Exactly two short, natural example sentences using the quoted part", .count(2))
  var examples: [String]
}

let instructions = """
You are a concise dictionary. The user gives a sentence where one part is wrapped in double quotes. Explain ONLY that quoted part as it is used in that sentence. Be brief.
"""

let input = String(decoding: FileHandle.standardInput.readDataToEndOfFile(), as: UTF8.self)

let model = SystemLanguageModel.default
guard case .available = model.availability else {
  FileHandle.standardError.write(Data("Apple on-device model unavailable: \(model.availability)\n".utf8))
  exit(2)
}

do {
  let session = LanguageModelSession(instructions: instructions)
  let r = try await session.respond(to: input, generating: Entry.self)
  let out: [String: Any] = ["meaning": r.content.meaning, "examples": r.content.examples]
  FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: out))
} catch {
  FileHandle.standardError.write(Data("\(error)\n".utf8))
  exit(1)
}
