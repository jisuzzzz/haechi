# P18 Permissions and policy

- Requirement: Required when changing authentication, authorization or exposure policy, or when a policy judgment is needed
- Placement: The relevant discussion in the body
- Narrative role: Explains the permissions and policies users will rely on and the judgments still needed.
- Author: Team owning the behavior and policy proposer
- Reviewer: The provider confirms enforcement, the consumer confirms screen and feature meaning, and the relevant policy owner confirms policy choices only
- Check: Are current code, desired policy and deployment configuration distinguished? Has success under specific conditions been expanded into overall safety or completed verification?

<!-- body:start -->
## Conditions to decide for permissions and policy

For [action] under [role, object, ownership and environment], the required policy is [allow, deny or exposure scope], and is [newly proposed, under review or agreed]. If existing behavior has been confirmed, distinguish that fact from the level of confirmation.

[Provider] confirms actual enforcement, [consumer] confirms screen and feature meaning, and [relevant policy owner] confirms policy choices. If only code was checked, or deployment configuration or actual requests were not checked, record that scope. Link required verification and next confirmation to [completion conditions, questions and owners].
<!-- body:end -->
