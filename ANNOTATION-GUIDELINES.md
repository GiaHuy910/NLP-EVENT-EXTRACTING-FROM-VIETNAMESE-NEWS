# Annotation Guidelines

Apply these rules consistently to each sentence. Use only information stated in that sentence;
do not infer entities, events, or relations from external knowledge or neighboring sentences.
These guidelines define the gold labels used by both server pipelines.

## A. Entities

| Label | Annotate | Do not annotate |
|---|---|---|
| `PERSON` | Proper names and abbreviated names (`T`, `L.T. V`, `Nguyễn Hùng M`) | Titles/ranks (`Thiếu tá`, `BS`, `nguyên Tổng giám đốc`); generic references (`bị cáo`, `nạn nhân`, `đối tượng`); nicknames (`đại ca`) |
| `ORGANIZATION` | Named institutions, including a location that is part of the name (`Công an huyện Kim Bình`, `TAND tỉnh Gia Lai`, `Bộ Công an`, `Quốc hội`, `phòng Cảnh sát hình sự`) | Generic terms alone (`công an`, `cảnh sát`, `cơ quan điều tra`, `HĐXX`, `Ban chuyên án`, `ngân hàng`); generic organization types (`công ty đại chúng`) |
| `LOCATION` | Place names with administrative prefixes (`tỉnh Vân Nam`, `TP. Thủ Dầu Một`); named structures (`Trạm biến áp 110 Hưng Nguyên`, `cụm cảng Cái Mép`, `toà nhà Golden Palm`). Split comma-separated addresses into separate spans. | Broad regions (`Bắc`, `Nam`); nationalities (`người Lào`); `TP` by itself |
| `TIME` | Specific times, including parts of day (`rạng sáng 17/10`, `chiều ngày 12/6`, `mùng 2 Tết`); prison terms/sentences (`3 năm tù`, `tử hình`, `11 năm tù giam`) | Relative time (`khoảng một tuần sau`, `cách đây 15 năm`, `mới được 3 tháng`); birth years (`SN 1965`); document numbers (`kết luận số 10/2017`) |
| `MONEY` | Amounts with currency units (`1,3 tỉ đồng`, `200.000 đ`) | Percentages and shares (`18% cổ phần`); counting units such as `/lá` |
| `DRUG` | Every mention of a drug, including quantity (`4 gói heroin`, `1,5kg ma túy`, `ma túy đá`) | `ma túy` inside an organization name (`Cục Phòng, chống ma túy…`) |
| `PRODUCT` | Objects related to the case: evidence, stolen property, weapons (`1 khẩu súng`, `dao`, `xe tay ga hiệu Ari Blade`) | Ordinary goods unrelated to an event (`thịt heo`); containers (`túi ni lông`, `ba lô`) |
| `CRIME` | Specific crime names after `tội` or quoted after `hành vi` (`cướp tài sản`, `giết người`, `trộm cắp tài sản`). Do not include the word `tội`. | Purpose descriptions (`chuyển tiền trái phép`); legal fields (`phòng chống tham nhũng`); allegations (`vi phạm bản quyền`) |

General entity rules:

- Annotate every occurrence of an entity in the sentence.
- Exclude punctuation at span boundaries, such as sentence-final periods, parentheses, and commas.
- Entity spans must not overlap.
- For a combined name such as `công an hai huyện Tĩnh Gia và Như Thanh`, annotate the whole
  institution name as one `ORGANIZATION`.

## B. Event triggers

The event types are `LUA_DAO`, `MA_TUY`, `BAO_LUC`, `CUOP_TROM`, `BAT_GIU`, `THU_GIU`, `KHOI_TO`,
and `XET_XU`.

1. Annotate only events that happened or are happening. Do not annotate intentions, plans,
   hypotheticals, negations, questions, or speculation: `nảy sinh ý định lừa đảo`, `quyết tâm truy
   bắt`, `để tiến hành khởi tố`, `nếu bắn chết`, `có thể đã chiếm đoạt`, `nằm trong kế hoạch… bắt
   giữ`, `liên quan… hay không`.
2. Use the main verb as the trigger; do not include modifiers or outcomes. For example, annotate
   `đâm`, not `đâm liên tiếp nhiều nhát` or `đâm chết`; annotate `tàng trữ`, not
   `tàng trữ chất ma túy`. Include a complete compound verb when it forms the trigger, such as
   `giết hại`, `bắt quả tang`, `bắt tạm giam`, `khống chế bắt giữ`, or `lừa đảo chiếm đoạt`.
3. For repeated mentions of the same event in one sentence, annotate one trigger, choosing the
   clearest assertion. Annotate distinct actions separately, such as `xét xử` and `tuyên phạt`, or
   `hành hung` and `bắn`.
4. Nouns referring to people are not triggers. In `Trộm đột nhập…`, the trigger is `đột nhập`.
5. For fraud tactics without the word `lừa`, annotate the main tactic verb as `LUA_DAO`, such as
   `giả giọng`, `tự xưng`, texting to request money, or `đưa ra` false information.
6. `BAO_LUC` includes physical harm: killing, stabbing, slashing, beating, shooting, throwing a
   grenade, armed fighting, resisting with a weapon, rape, or `tước đoạt / tước đi` tính mạng.
7. Do not annotate investigation, verification, pursuit, arrest warrants, reporting, accusations,
   confessions, generic offending/violations, threats, arguments, checks, generic raids,
   administrative fines/citations, asset freezes, bribery, forged signatures, document forgery when
   not used for fraud, civil lawsuits, drug addiction/positive drug tests, animal slaughter, or
   fishing.
8. `bắt` in `bắt cóc` is not `BAT_GIU`; annotate the full kidnapping phrase as `BAO_LUC` when it
   describes an actual event. Do not annotate `bắt` in `đánh bắt` or `bắt đầu`. Annotate
   `truy bắt thành công` as `BAT_GIU`, but not `truy bắt` alone.

## C. Relations and roles

Relations always point from a trigger to an entity. A sentence without a trigger has no relation.

| Role | Allowed entity labels | Meaning |
|---|---|---|
| `DOI_TUONG` | `PERSON`, `ORGANIZATION` | The named person or organization responsible for the event |
| `NAN_NHAN` | `PERSON`, `ORGANIZATION` | The named person or organization harmed by a crime event |
| `CO_QUAN` | `ORGANIZATION` | The institution directly carrying out a legal-proceeding action |
| `TAI_SAN` | `MONEY`, `PRODUCT` | Stolen or fraudulently obtained money/product |
| `TANG_VAT` | `DRUG`, `PRODUCT` | Seized evidence or an object in a drug case |
| `HUNG_KHI` | `PRODUCT` | A product used as a weapon to commit the crime |
| `TOI_DANH` | `CRIME` | A crime entity |
| `MUC_AN` | `TIME`, `MONEY` | A sentence/penalty linked to an `XET_XU` event |
| `THOI_GIAN` | `TIME` | The time when the event occurred |
| `DIA_DIEM` | `LOCATION` | The place where the event occurred |

Relation rules:

1. Link only annotated entities. Do not link unnamed people such as `bị cáo`, `hai anh em`, or `mẹ`.
2. Link the nearest matching entity in the same clause. Do not link a repeated name from another
   clause.
3. `DIA_DIEM` is where the event occurred. Do not link a hometown/residence (`quê`, `ngụ`, `trú`,
   `ở`) or a destination/purpose (`để tiêu thụ tại Việt Nam`).
4. `THOI_GIAN` is the event time, not the reporting date (`Ngày 16-11, … cho biết`).
5. `CO_QUAN` is the institution directly carrying out the legal-proceeding action, not the suspect's
   employer.
6. An advertised sale price is not `TAI_SAN`.
7. Link `MUC_AN` from an `XET_XU` trigger to a sentence span labeled `TIME` or `MONEY`.

## D. Quality review

After export, run [the annotation checker](data_pipeline/check_annotations.py), inspect its
`*_issues.csv`, and manually resolve confirmed issues such as reversed relations, invalid
role/entity types, or punctuation included in a span. Warnings require review and are not
automatically corrected.
